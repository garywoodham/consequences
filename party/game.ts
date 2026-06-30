import type * as Party from "partykit/server";
import { buildMixedStories } from "../lib/story-builder";
import type { ClientMessage, GameState, Player } from "../lib/types";

export default class GameServer implements Party.Server {
  state: GameState | null = null;
  connectionToPlayer = new Map<string, string>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    if (this.state) {
      conn.send(JSON.stringify({ type: "state", state: this.state }));
    }
  }

  onClose(conn: Party.Connection) {
    const playerId = this.connectionToPlayer.get(conn.id);
    this.connectionToPlayer.delete(conn.id);
    if (!this.state || !playerId) return;

    const player = this.state.players.find((p) => p.id === playerId);
    if (player) {
      const stillConnected = [...this.connectionToPlayer.values()].includes(playerId);
      if (!stillConnected) {
        player.connected = false;
        this.broadcastState();
      }
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(message) as ClientMessage;
    } catch {
      sender.send(JSON.stringify({ type: "error", message: "Invalid message" }));
      return;
    }

    switch (parsed.type) {
      case "join":
        this.handleJoin(parsed, sender);
        break;
      case "start":
        this.handleStart(sender);
        break;
      case "submit":
        this.handleSubmit(parsed, sender);
        break;
      case "play-again":
        this.handlePlayAgain(sender);
        break;
    }
  }

  handleJoin(msg: Extract<ClientMessage, { type: "join" }>, sender: Party.Connection) {
    // Only the first connection can create a room, and only when no state exists
    if (!this.state && msg.isHost) {
      this.state = {
        roomCode: this.room.id.toUpperCase(),
        hostId: msg.playerId,
        templateId: msg.templateId ?? "classic",
        phase: "lobby",
        players: [],
        submissions: {},
        stories: [],
      };
    }

    if (!this.state) {
      sender.send(JSON.stringify({ type: "error", message: "Game not found. Check the room code." }));
      return;
    }

    if (this.state.phase !== "lobby" && !this.state.players.some((p) => p.id === msg.playerId)) {
      sender.send(JSON.stringify({ type: "error", message: "Game already in progress" }));
      return;
    }

    this.connectionToPlayer.set(sender.id, msg.playerId);

    const existing = this.state.players.find((p) => p.id === msg.playerId);
    if (existing) {
      // Reconnecting player — update profile but never change host status
      existing.name = msg.name;
      existing.avatarUrl = msg.avatarUrl;
      existing.connected = true;
      existing.isHost = existing.id === this.state.hostId;
    } else if (this.state.phase === "lobby") {
      // New player — host is determined solely by hostId, never by the join message
      const player: Player = {
        id: msg.playerId,
        name: msg.name,
        avatarUrl: msg.avatarUrl,
        connected: true,
        isHost: msg.playerId === this.state.hostId,
        hasSubmitted: false,
      };
      this.state.players.push(player);
    }

    this.broadcastState();
  }

  handleStart(sender: Party.Connection) {
    if (!this.state) return;
    const playerId = this.connectionToPlayer.get(sender.id);
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player?.isHost) {
      sender.send(JSON.stringify({ type: "error", message: "Only the host can start" }));
      return;
    }
    if (this.state.players.filter((p) => p.connected).length < 2) {
      sender.send(JSON.stringify({ type: "error", message: "Need at least 2 players" }));
      return;
    }

    this.state.phase = "writing";
    this.state.submissions = {};
    this.state.stories = [];
    this.state.players.forEach((p) => {
      p.hasSubmitted = false;
    });
    this.broadcastState();
  }

  handleSubmit(msg: Extract<ClientMessage, { type: "submit" }>, sender: Party.Connection) {
    if (!this.state || this.state.phase !== "writing") return;

    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId) return;

    this.state.submissions[playerId] = msg.answers;
    const player = this.state.players.find((p) => p.id === playerId);
    if (player) player.hasSubmitted = true;

    const connectedPlayers = this.state.players.filter((p) => p.connected);
    const allSubmitted = connectedPlayers.every((p) => this.state!.submissions[p.id]);

    if (allSubmitted && connectedPlayers.length > 0) {
      this.state.stories = buildMixedStories(
        this.state.players,
        this.state.submissions,
        this.state.templateId
      );
      this.state.phase = "reveal";
    }

    this.broadcastState();
  }

  handlePlayAgain(sender: Party.Connection) {
    if (!this.state) return;
    const playerId = this.connectionToPlayer.get(sender.id);
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player?.isHost) {
      sender.send(JSON.stringify({ type: "error", message: "Only the host can restart" }));
      return;
    }

    this.state.phase = "writing";
    this.state.submissions = {};
    this.state.stories = [];
    this.state.players.forEach((p) => {
      p.hasSubmitted = false;
    });
    this.broadcastState();
  }

  broadcastState() {
    if (!this.state) return;
    this.room.broadcast(JSON.stringify({ type: "state", state: this.state }));
  }
}

GameServer satisfies Party.Worker;
