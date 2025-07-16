export type Color = "blue" | "red";

export type PawnPosition = "ready" | "finished" | number;

export type Direction = "down" | "left" | "right" | "left-down" | "right-down";

export interface Path {
	direction: Direction;
	next: PawnPosition;
}

export interface Node {
	index: PawnPosition;
	top: string;
	left: string;
	subsequent: PawnPosition; // 현재 노드가 경유 노드일 때 다음 노드
	candidate: Path[]; // 경로를 선택할 수 있는 경우
}

export interface DiceInfo {
	faces: number[];
	sum: number;
}

export interface PawnState {
	color: Color;
	position: PawnPosition; // "ready", "finished", or a number indicating the position on the board
	index: number; // index of the pawn in the player's pawns
}

export interface PlayerState {
	name: string; // 유저 닉네임
	profilePic?: string; // 프로필 사진 URL (선택적)
	color: Color;
	pawnsState: PawnState[];
	diceValues: number[]; // 주사위의 각 면의 값
	diceResult: number; // 아직 주사위를 굴리지 않았으면 0
	bonus: number; // 잡은 말 개수 * 3
}

export interface Animation {
	userId: number; // UserID of the player who moved the pawns
	pawnsIndex: number[]; // Index of the pawn that was moved
	fromNode: PawnPosition; // Starting position of the pawn
	toNode: PawnPosition; // Ending position of the pawn
}

// ===== Socket.IO Event Types =====

// 서버에서 클라이언트로 보내는 이벤트들
export interface SocketEvents {
	// 게임 시작 알림
	matched: MatchedEvent;

	// 초기 게임 상태 전송
	gameState: GameState;

	// 주사위 굴림 결과
	diceRolled: DiceRolledEvent;

	// 말 이동 결과
	pawnsMoved: PawnsMovedEvent;

	// 상대 플레이어가 게임을 떠났을 때
	playerLeft: ErrorEvent;

	// 새로운 턴 시작 알림
	newTurnStart: void;

	// 게임이 끝남
	gameEnded: GameEndedEvent;

	// 에러 메시지
	error: ErrorEvent;
}

// 클라이언트에서 서버로 보내는 이벤트들
export interface ClientEvents {
	// 게임 참가 (대기실에 추가)
	join: JoinEvent;

	// 초기 게임 상태 요청
	startGame: startGameEvent;

	// 주사위 완성
	buildDice: BuildDiceEvent;

	// 말 이동 경로 결정
	movePawns: MovePawnsEvent;

	// 말 이동 애니메이션 종료
	animationEnd: AnimationEndEvent;
}

export interface MatchedEvent {
	gameId: string; // 게임 ID
}

export interface GameState {
	gameId: string;
	playersState: string; // Map<number, PlayerState>; // Map of userIDs to PlayerState
	currentTurn: number;
}

export interface GameStartedEvent {
	gameId: string;
}

export interface GameEndedEvent {
	winner: number; // UserID of the winner
}

export interface DiceRolledEvent {
	diceValues: string; // Map<number, number[]>; // 주사위 6면 값
	diceResults: string; // Map<number, number>; // 주사위 굴린 결과
	turn: number; // 현재 턴 유저 ID
}

export interface PawnsMovedEvent {
	animation: Animation[];
}

export interface ErrorEvent {
	message: string;
}

export interface JoinEvent {
	userId: number;
}

export interface startGameEvent {
	gameId: string;
}

export interface BuildDiceEvent {
	gameId: string;
	userId: number; // UserID of the player who built the dice
	diceValues: number[];
}

export interface MovePawnsEvent {
	gameId: string;
	animation: Animation[];
}

export interface AnimationEndEvent {
	gameId: string;
	userId: number; // UserID of the player who moved the pawns
}

export function mapToString<K, V>(map: Map<K, V>): string {
	// Map을 배열로 변환 후 JSON 문자열로 직렬화
	return JSON.stringify(Array.from(map.entries()));
}

export function stringToMap<K, V>(str: string): Map<K, V> {
	// JSON 문자열을 배열로 파싱 후 Map으로 변환
	return new Map(JSON.parse(str));
}
