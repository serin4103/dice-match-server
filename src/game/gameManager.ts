import { GameState, PlayerState, Color, DiceRolledEvent, Animation } from "../types/game";
import { PrismaClient } from '@prisma/client';
type PlayerInfo = { socketId: string; userId: number };

function mapToString<K, V>(map: Map<K, V>): string {
  // Map을 배열로 변환 후 JSON 문자열로 직렬화
  return JSON.stringify(Array.from(map.entries()));
}
function stringToMap<K, V>(str: string): Map<K, V> {
  // JSON 문자열을 배열로 파싱 후 Map으로 변환
  return new Map(JSON.parse(str));
}

export class GameManager {
    private waitingPlayers: Map<string, number> = new Map(); // (socketId, userId)
    private activeGames: Map<string, GameState> = new Map(); // (gameId, game)
    private socketIdMap: Map<number, string> = new Map(); // (userId, socketId)
    private userIdMap: Map<string, number> = new Map(); // (socketId, userId)

    prisma = new PrismaClient();

    // ------------------- Utility ----------------

    getSocketId(gameId: string): null | string[] {
        const game = this.activeGames.get(gameId);
        if(!game) return null;
        const userIds: number[] = Array.from(stringToMap<number, PlayerState>(game.playersState).keys());
        const socketIds = userIds.filter(userId => this.socketIdMap.has(userId))
        .map(userId => this.socketIdMap.get(userId)!);
        return socketIds;
    }
    
    getGameById(gameId: string): GameState | null {
        return this.activeGames.get(gameId) || null;
    }

    getGameBySocketId(socketId: string): GameState | null {
        let userId = this.userIdMap.get(socketId);
        if(!userId) return null;
        let foundGame: GameState | null = null;
        this.activeGames.forEach((game, gameId) => {
            const playersMap = stringToMap<number, PlayerState>(game.playersState);
            if (playersMap.has(userId)) {
                foundGame = game;
            }
        });
        return foundGame;
    }

    // ---------------- Utility end ---------------

    async addPlayer(socketId: string, userId: number): Promise<null | string> {
        // 대기실에 플레이어 추가
        if (this.waitingPlayers.has(socketId)) {
            return null;
        }
        this.waitingPlayers.set(socketId, userId);
        console.log(`👤 ${userId} joined waiting queue`);
        // 대기실에 충분한 플레이어가 있으면 게임 시작
        return await this.tryStartGame();
    }
    private async tryStartGame(): Promise<null | string> {
        if (this.waitingPlayers.size < 2) return null;
        // 대기실에서 플레이어들을 가져와서 게임 생성
        const players = Array.from(this.waitingPlayers.entries()).slice(0, 2);

        // 대기실에서 제거
        players.forEach(([socketId, userId]) => {
            this.waitingPlayers.delete(socketId);
            this.socketIdMap.set(userId, socketId); //socketIdMap update
            this.userIdMap.set(socketId, userId); //userIdMap update
        });

        // 새 게임 생성
        const gameId = this.generateGameId();

        // activeGames update
        this.activeGames.set(gameId, await this.initGameState(
            gameId, 
            {socketId: players[0][0], userId: players[0][1]} as PlayerInfo, 
            {socketId: players[1][0], userId: players[1][1]} as PlayerInfo
        ));
        console.log(
            `🎮 Game ${gameId} created with players: ${players
                .map((p) => p[1])
                .join(", ")}`
        );
        return gameId;
    }
    private generateGameId(): string {
        return `game_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`;
    }
    private async initGameState(gameId: string, player1: PlayerInfo, player2: PlayerInfo) : Promise<GameState> {
        const state1 = await this.initPlayerState(player1, "blue");
        const state2 = await this.initPlayerState(player2, "red");
        return {
            gameId: gameId,
            playersState: mapToString(new Map<number, PlayerState>([
                [player1.userId, state1],
                [player2.userId, state2],
            ])),
            currentTurn: player1.userId
        };
    }
    private async initPlayerState(player: PlayerInfo, color: Color): Promise<PlayerState> {
        // 1. prisma에서 유저 정보 가져오기
        const user = await this.prisma.user.findUnique({
            where: { id: player.userId },
            select: { username: true, profilePicture: true }
        });

        if (!user) {
            throw new Error(`User not found: ${player.userId}`);
        }

        // 2. PlayerState 객체 구성
        return {
            name: user.username,
            profilePic: user.profilePicture ?? undefined,
            color: color,
            pawnsState: Array.from({ length: 4 }, (_, i) => ({
                color: color,
                position: "ready",
                index: i,
            })),
            diceValues: [0, 0, 0, 0, 0, 0],        // 초기값 필요에 따라 설정
            diceResult: 0,
            bonus: 0
        };
    }
    /*
    removePlayer(socketId: string): void {
        // 대기실에서 플레이어 제거
        this.waitingPlayers.delete(socketId);
        
        // 활성 게임에서도 플레이어 제거
        const activeGames = this.getActiveGames();
        
        const userGame = activeGames.find((game) =>
            Array.from(game.playersState.keys()).includes(socketId)
        );

        if (userGame) {
            this.removeGame(userGame.id);
        }
    }
    */
    

    buildDice( gameId: string, userId: number, diceValues: number[] ) : null | DiceRolledEvent {
        const game = this.activeGames.get(gameId);
        if(!game){
            throw new Error(`Game not found: ${gameId}`);
        }
        const mp = stringToMap<number, PlayerState>(game.playersState);
        const playerState = mp.get(userId);
        if(!playerState){
            throw new Error(`Player state not found: ${userId}`);
        }
        playerState.diceValues = diceValues;
        game.playersState = mapToString<number, PlayerState>(mp);
        const allNotZero : boolean = Array.from(stringToMap<number, PlayerState>(game.playersState).values()).every(
            player =>
                !(
                Array.isArray(player.diceValues) &&
                player.diceValues.length === 6 &&
                player.diceValues.every(v => v === 0)
                )
            );
        if(!allNotZero) return null;
        const [[userId1, playerState1], [userId2, playerState2]] = Array.from(stringToMap<number, PlayerState>(game.playersState).entries());
        const diceVal1 = this.getRandVal(playerState1.diceValues);
        const diceVal2 = this.getRandVal(playerState2.diceValues);
        let turnUserId;
        if(diceVal1 > diceVal2) turnUserId = userId1;
        else if(diceVal1 < diceVal2) turnUserId = userId2;
        else turnUserId = userId1 + userId2 - game.currentTurn;
        game.currentTurn = turnUserId;
        const diceValueMap = new Map<number, number[]>([
            [userId1, playerState1.diceValues],
            [userId2, playerState2.diceValues]
        ]);
        const diceResultMap = new Map<number, number>([
            [userId1, diceVal1],
            [userId2, diceVal2]
        ]);
        return {
            diceValues: mapToString<number, number[]>(diceValueMap), 
            diceResults: mapToString<number, number>(diceResultMap), 
            turn: turnUserId
        };
    }
    getRandVal(arr : number[]) : number {
        const randInt = Math.floor(Math.random() * arr.length);
        return arr[randInt];
    }
    initDice( gameId: string) {
        const game = this.getGameById(gameId)!;
        const playersState = stringToMap<number, PlayerState>(game.playersState);
        playersState.forEach((player, playerId) => {
            player.diceValues = [0, 0, 0, 0, 0, 0];
        });
        //for (const player of playersState.values()) player.diceValues = [0, 0, 0, 0, 0, 0];
        game.playersState = mapToString<number, PlayerState>(playersState);
    }

    updAnimation( gameId: string, anim: Animation) {
        const game = this.getGameById(gameId)!;
        const playersState = stringToMap<number, PlayerState>(game.playersState);
        const playerState = playersState.get(anim.userId);
        if(!playerState) throw new Error("updAnimation: player does not exist");
        for(const pawnIndex of anim.pawnsIndex){
            playerState.pawnsState[pawnIndex].position = anim.toNode;
        }
        game.playersState = mapToString<number, PlayerState>(playersState);
    }

    updAnimationEnd( gameId: string, userId: number) : null | number {
        const game = this.getGameById(gameId);
        if(!game) throw new Error("updAnimationEnd: game does not exist");
        const playerState = stringToMap<number, PlayerState>(game.playersState).get(userId);
        if(!playerState) throw new Error("updAnimationEnd: player does not exist");
        playerState.diceValues = [0, 0, 0, 0, 0, 0];
        const allzero = Array.from(stringToMap<number, PlayerState>(game.playersState).values()).every(playerState =>
            Array.isArray(playerState.diceValues) &&
            playerState.diceValues.length === 6 &&
            playerState.diceValues.every(v => v === 0)
        );
        if(allzero) return this.checkGameEnd(gameId);
        else return null;
    }
    checkGameEnd( gameId: string ) : null | number{
        const game = this.getGameById(gameId)!;
        for (const [userId, playerState] of stringToMap<number, PlayerState>(game.playersState).entries()) {
            const allOut = playerState.pawnsState.every(pawn => pawn.position === "finished");
        if (allOut) return userId;
        }
        return null;
    }

    removeGame(gameId: string): boolean {
        // 특정 게임을 activeGames에서 제거
        const game = this.getGameById(gameId);
        if (game) {
            for (const userId of stringToMap<number, PlayerState>(game.playersState).keys()) {
                const socketId = this.socketIdMap.get(userId);
                if(socketId) this.userIdMap.delete(socketId);
                this.socketIdMap.delete(userId);
            }
            this.activeGames.delete(gameId);
            console.log(`🗑️ Game ${gameId} removed from active games`);
            return true;
        }
        
        console.log(`⚠️ Game ${gameId} not found in active games`);
        return false;
    }
}
