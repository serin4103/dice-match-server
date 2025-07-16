import { Socket } from 'socket.io-client';
import { SocketEvents, ClientEvents } from './game';

// Socket.IO 클라이언트 타입
export type GameSocket = Socket<SocketEvents, ClientEvents>;

// 소켓 연결 상태
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// 소켓 훅 반환 타입
export interface UseSocketReturn {
  socket: GameSocket | null;
  status: ConnectionStatus;
  connect: (userId: number) => void;
  disconnect: () => void;
  joinGame: (userId: number) => void;
  startGame: () => void;
  rollDice: () => void;
}

// 소켓 이벤트 리스너 타입
export type SocketEventListener<T extends keyof SocketEvents> = (data: SocketEvents[T]) => void;

// 소켓 에러 타입
export interface SocketError {
  message: string;
  code?: string;
} 