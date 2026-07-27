// Server-only: calls a local ComfyUI instance via its HTTP API.
import fs from "fs";
import path from "path";
import type { CaricatureStyle } from "../types";
import defaultPanelTxt2Img from "../../comfy/workflows/panel-txt2img.json";
import defaultPanelImg2Img from "../../comfy/workflows/panel-img2img.json";
import defaultCaricatureImg2Img from "../../comfy/workflows/caricature-img2img.json";

const PROMPT_PLACEHOLDER = "__PROMPT__";
const IMAGE_PLACEHOLDER = "__IMAGE__";
const DEFAULT_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 1_500;

export type ComfyImageResult = {
  imageUrl: string | null;
  prompt: string;
  reason?: string;
};

type ComfyWorkflow = Record<
  string,
  {
    inputs?: Record<string, unknown>;
    class_type?: string;
  }
>;

type ComfyHistoryEntry = {
  outputs?: Record<
    string,
    {
      images?: Array<{
        filename: string;
        subfolder?: string;
        type?: string;
      }>;
    }
  >;
};

const workflowCache = new Map<string, ComfyWorkflow>();

export function isComfyConfigured(): boolean {
  return Boolean(process.env.COMFYUI_URL?.trim());
}

function comfyBaseUrl(): string {
  return process.env.COMFYUI_URL!.trim().replace(/\/+$/, "");
}

function loadWorkflow(
  envKey: string | undefined,
  bundledDefault: ComfyWorkflow
): ComfyWorkflow {
  const configured = envKey?.trim();
  if (!configured) {
    return structuredClone(bundledDefault);
  }

  const filePath = path.isAbsolute(configured)
    ? configured
    : path.join(/* turbopackIgnore: true */ process.cwd(), configured);

  const cached = workflowCache.get(filePath);
  if (cached) return structuredClone(cached);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `ComfyUI workflow not found at ${filePath}. ` +
        `Export a workflow from ComfyUI (Save API Format) or fix the env path.`
    );
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as ComfyWorkflow;
  workflowCache.set(filePath, parsed);
  return structuredClone(parsed);
}

function panelTxt2ImgWorkflow(): ComfyWorkflow {
  return loadWorkflow(process.env.COMFYUI_WORKFLOW, defaultPanelTxt2Img as ComfyWorkflow);
}

function panelImg2ImgWorkflow(): ComfyWorkflow {
  return loadWorkflow(
    process.env.COMFYUI_PANEL_IMG2IMG_WORKFLOW,
    defaultPanelImg2Img as ComfyWorkflow
  );
}

function caricatureWorkflow(): ComfyWorkflow {
  return loadWorkflow(
    process.env.COMFYUI_CARICATURE_WORKFLOW,
    defaultCaricatureImg2Img as ComfyWorkflow
  );
}

function injectWorkflowValues(
  workflow: ComfyWorkflow,
  values: { prompt: string; seed?: number; imageFilename?: string }
): ComfyWorkflow {
  for (const node of Object.values(workflow)) {
    if (!node.inputs) continue;

    for (const [key, value] of Object.entries(node.inputs)) {
      if (value === PROMPT_PLACEHOLDER) {
        node.inputs[key] = values.prompt;
      }
      if (value === IMAGE_PLACEHOLDER && values.imageFilename) {
        node.inputs[key] = values.imageFilename;
      }
    }

    if (node.class_type === "KSampler" && values.seed != null) {
      node.inputs!.seed = values.seed;
    }
  }

  return workflow;
}

async function imageUrlToBuffer(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith("data:")) {
    const comma = imageUrl.indexOf(",");
    const b64 = comma >= 0 ? imageUrl.slice(comma + 1) : imageUrl;
    return Buffer.from(b64, "base64");
  }
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch image (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function uploadImageToComfy(imageUrl: string): Promise<string> {
  const buf = await imageUrlToBuffer(imageUrl);
  const form = new FormData();
  form.append(
    "image",
    new Blob([new Uint8Array(buf)], { type: "image/png" }),
    `consequences_${Date.now()}.png`
  );
  form.append("type", "input");
  form.append("overwrite", "true");

  const res = await fetch(`${comfyBaseUrl()}/upload/image`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `ComfyUI /upload/image failed (${res.status}): ${body.slice(0, 200) || res.statusText}`
    );
  }

  const data = (await res.json()) as { name?: string };
  if (!data.name) {
    throw new Error("ComfyUI /upload/image returned no filename");
  }
  return data.name;
}

async function submitPrompt(workflow: ComfyWorkflow): Promise<string> {
  const res = await fetch(`${comfyBaseUrl()}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: workflow,
      client_id: "consequences",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `ComfyUI /prompt failed (${res.status}): ${body.slice(0, 200) || res.statusText}`
    );
  }

  const data = (await res.json()) as { prompt_id?: string };
  if (!data.prompt_id) {
    throw new Error("ComfyUI /prompt returned no prompt_id");
  }
  return data.prompt_id;
}

function firstOutputImage(
  entry: ComfyHistoryEntry
): { filename: string; subfolder: string; type: string } | null {
  for (const output of Object.values(entry.outputs ?? {})) {
    const image = output.images?.[0];
    if (image?.filename) {
      return {
        filename: image.filename,
        subfolder: image.subfolder ?? "",
        type: image.type ?? "output",
      };
    }
  }
  return null;
}

async function pollForOutput(
  promptId: string,
  waitMs: number
): Promise<{ filename: string; subfolder: string; type: string }> {
  const deadline = Date.now() + waitMs;

  while (Date.now() < deadline) {
    const res = await fetch(`${comfyBaseUrl()}/history/${promptId}`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `ComfyUI /history failed (${res.status}): ${body.slice(0, 200) || res.statusText}`
      );
    }

    const history = (await res.json()) as Record<string, ComfyHistoryEntry>;
    const entry = history[promptId];
    const image = entry ? firstOutputImage(entry) : null;
    if (image) return image;

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `ComfyUI timed out after ${Math.round(waitMs / 1000)}s waiting for ${promptId}`
  );
}

async function fetchOutputImage(
  image: { filename: string; subfolder: string; type: string }
): Promise<Buffer> {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder,
    type: image.type,
  });
  const res = await fetch(`${comfyBaseUrl()}/view?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`ComfyUI /view failed (${res.status}) for ${image.filename}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function configuredTimeoutMs(): number {
  const raw = process.env.COMFYUI_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function bufferToDataUrl(buf: Buffer, filename: string): string {
  const mime =
    filename.endsWith(".jpg") || filename.endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function comfyFailure(error: unknown, prompt: string): ComfyImageResult {
  const message =
    error instanceof Error ? error.message : "ComfyUI generation failed";
  const base = comfyBaseUrl();
  const reason = message.includes("fetch failed")
    ? `ComfyUI unreachable at ${base} — is it running?`
    : message;

  console.error(`[comfy] ${reason}`);
  return { imageUrl: null, prompt, reason };
}

async function runComfyGeneration(
  workflow: ComfyWorkflow,
  prompt: string,
  options: { seed?: number; referenceImageUrl?: string } = {}
): Promise<ComfyImageResult> {
  if (!isComfyConfigured()) {
    return {
      imageUrl: null,
      prompt,
      reason: "ComfyUI is not configured (set COMFYUI_URL).",
    };
  }

  try {
    let imageFilename: string | undefined;
    if (options.referenceImageUrl) {
      imageFilename = await uploadImageToComfy(options.referenceImageUrl);
    }

    const prepared = injectWorkflowValues(workflow, {
      prompt,
      seed: options.seed,
      imageFilename,
    });

    const promptId = await submitPrompt(prepared);
    console.log(
      `[comfy] queued prompt_id=${promptId} seed=${options.seed ?? "random"} ` +
        `ref=${imageFilename ? "yes" : "no"}`
    );

    const output = await pollForOutput(promptId, configuredTimeoutMs());
    const imageBuf = await fetchOutputImage(output);

    return {
      imageUrl: bufferToDataUrl(imageBuf, output.filename),
      prompt,
    };
  } catch (error) {
    return comfyFailure(error, prompt);
  }
}

/** Turn a player photo into a cartoon caricature via local img2img. */
export async function generateCaricatureWithComfy(
  imageUrl: string,
  prompt: string,
  seed?: number
): Promise<ComfyImageResult> {
  return runComfyGeneration(caricatureWorkflow(), prompt, {
    seed,
    referenceImageUrl: imageUrl,
  });
}

/** Portrait from a text description (celebrity / named character with no photo). */
export async function generateLookalikeWithComfy(
  prompt: string,
  seed?: number
): Promise<ComfyImageResult> {
  return runComfyGeneration(panelTxt2ImgWorkflow(), prompt, { seed });
}

/** Comic panel — img2img when a caricature reference exists, else txt2img. */
export async function generatePanelWithComfy(
  prompt: string,
  seed?: number,
  referenceImageUrl?: string
): Promise<ComfyImageResult> {
  const workflow = referenceImageUrl
    ? panelImg2ImgWorkflow()
    : panelTxt2ImgWorkflow();
  return runComfyGeneration(workflow, prompt, {
    seed,
    referenceImageUrl,
  });
}

/** Style hint strings shared with comic.ts lookalike prompts. */
export function lookalikeStyleHint(style: CaricatureStyle): string {
  switch (style) {
    case "exaggerated":
      return "bold heavily exaggerated caricature, amplify distinctive features";
    case "flattering":
      return "flattering idealised cartoon caricature, glamorous and clear-skinned";
    case "faithful":
      return "clean lightly stylised cartoon portrait, true-to-life proportions";
    case "balanced":
    default:
      return "moderately exaggerated cartoon caricature, instantly recognisable";
  }
}
