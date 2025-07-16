import { Server, Socket } from "socket.io";
import { GameManager } from "../game/gameManager";
import { MatchedEvent, Animation, PawnsMovedEvent } from "../types/game";

type PlayerInfo = { socketId: string; userId: string };

function mapToString<K, V>(map: Map<K, V>): string {
  // Map을 배열로 변환 후 JSON 문자열로 직렬화
  return JSON.stringify(Array.from(map.entries()));
}

function stringToMap<K, V>(str: string): Map<K, V> {
  // JSON 문자열을 배열로 파싱 후 Map으로 변환
  return new Map(JSON.parse(str));
}

export function setupSocketHandlers(io: Server) {
    const gameManager = new GameManager();

    io.on("connection", (socket: Socket) => {
        console.log(`👤 User connected: ${socket.id} from ${socket.request.headers.origin}`);

        // 연결 상태 확인용 핸들러
        socket.on("ping", () => {
            console.log(`📡 Ping from ${socket.id}`);
            socket.emit("pong");
        });

        // 사용자 입장 (대기실에 추가)
        socket.on("join", async (data: { userId: number }) => {
            try {
                console.log(`🎮 ${data.userId} joined the waiting queue`);
                const newGameId = await gameManager.addPlayer(socket.id, data.userId);
                if(newGameId === null) return;
                // MatchedEvent 보내기
                const socketIds = gameManager.getSocketId(newGameId);
                socketIds?.forEach((socketId) => {
                    io.to(socketId).emit("matched", {
                        gameId: newGameId} as MatchedEvent);
                });
            } catch (error) {
                console.error(`❌ Error in join handler:`, error);
                socket.emit("error", { message: "Failed to join game" });
            }
        });

        // 에러 처리
        socket.on("error", (error) => {
            console.error(`🚨 Socket error from ${socket.id}:`, error);
        });

        // 게임 시작
        socket.on("startGame", (data : {gameId: string}) => {
            const game = gameManager.getGameById(data.gameId)!;
            socket.emit("gameState", game);
        })

        // 주사위 굴리기
        socket.on("buildDice", (data: { gameId: string, userId: number, diceValues: number[] }) => {
            console.log("buildDice: ", data.gameId, data.userId, data.diceValues);
            const updResult = gameManager.buildDice(data.gameId, data.userId, data.diceValues);
            console.log("updResult: ", updResult);
            if(updResult === null) return;
            gameManager.initDice(data.gameId);
            const socketIds = gameManager.getSocketId(data.gameId);
            socketIds?.forEach((socketId) => {
                io.to(socketId).emit("diceRolled", updResult);
            });
        });

        // 애니메이션 
        socket.on("movePawns", (data: { gameId: string, animation: Animation[]}) => {
            data.animation.forEach((anim) => {
                gameManager.updAnimation(data.gameId, anim);
            });
            const socketIds = gameManager.getSocketId(data.gameId);
            socketIds?.forEach((socketId) => {
                console.log("pawnsMoved: ", data.animation);
                io.to(socketId).emit("pawnsMoved", {animation: data.animation} as PawnsMovedEvent);
            });
        });

        socket.on("animationEnd", (data: { gameId: string, userId: number}) => {
            const winner = gameManager.updAnimationEnd(data.gameId, data.userId);
            const socketIds = gameManager.getSocketId(data.gameId);
            if(!winner){
                socketIds?.forEach((socketId) => {
                    io.to(socketId).emit("newTurnStart", {});
                });
            } else {
                socketIds?.forEach((socketId) => {
                    io.to(socketId).emit("gameEnded", {winner: winner});
                });
                // 게임 매니저에서 게임 제거
                gameManager.removeGame(data.gameId);
                console.log(`🗑️ Game ${data.gameId} deleted`);
            }

        });

        // 연결 해제    
        socket.on("disconnect", () => {
            console.log(`👋 User disconnected: ${socket.id}`);
            const game = gameManager.getGameBySocketId(socket.id);
            if(!game) return;
            const gameId = game.gameId;
            const socketIds = gameManager.getSocketId(gameId);
            socketIds?.forEach((socketId) => {
                console.log("playerLeft: ", gameId);
                io.to(socketId).emit("playerLeft", "playerLeft");
            });
            gameManager.removeGame(gameId);
        });
    });
}
