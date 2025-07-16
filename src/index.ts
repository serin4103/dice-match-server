import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs";
import { setupSocketHandlers } from "./socket/socketHandler";
import prisma from "./lib/prisma";

// 환경 변수 로드
dotenv.config();

const app = express();

// Railway 등 클라우드 플랫폼에서는 리버스 프록시가 HTTPS를 처리하므로 
// 애플리케이션은 항상 HTTP 서버로 실행
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST", "PATCH"],
        credentials: true,
    },
    // 클라우드 환경에서의 연결 안정성을 위한 설정
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    // Railway 환경에서 필요한 설정
    serveClient: false, // 클라이언트 파일 제공 안 함
    path: '/socket.io/', // 기본 경로 명시
});

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// 업로드 디렉토리 생성
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 정적 파일 제공
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

// Multer 설정 (파일 업로드)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB 제한
    },
    fileFilter: (req, file, cb) => {
        // 이미지 파일만 허용
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(null, false);
        }
    }
});

// 기본 라우트
app.get("/", (req: Request, res: Response) => {
    res.json({ message: "Dice Match Socket Server" });
});

app.get("/user/:email", async (req: Request, res: Response) => {
    try {
        const { email } = req.params;
        
        if (!email) {
            res.status(400).json({ error: "Email parameter is required" });
            return;
        }

        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        // 사용자가 없어도 에러를 발생시키지 않고 기본값 반환
        if (!existingUser) {
            const userInfo = {
                id: null,
                email: email,
                username: null,
                win: 0,
                lose: 0,
                profilePicture: null,
                isRegistered: false,
            };
            res.json(userInfo);
            return;
        }

        // NextAuth 코드와 동일한 형태로 사용자 정보 반환
        const userInfo = {
            id: existingUser.id,
            email: existingUser.email,
            username: existingUser.username,
            win: existingUser.win,
            lose: existingUser.lose,
            profilePicture: existingUser.profilePicture,
            isRegistered: !!existingUser.username,
        };

        res.json(userInfo);
    } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// 사용자 생성 또는 업데이트 라우트 (회원가입용 - 텍스트 데이터만)
app.post("/user", async (req: Request, res: Response) => {
    try {
        const { email, username } = req.body;
        
        if (!email) {
            res.status(400).json({ error: "Email is required" });
            return;
        }

        // 사용자 생성 또는 업데이트 (upsert)
        const user = await prisma.user.upsert({
            where: { email },
            update: {
                username: username || undefined,
            },
            create: {
                email,
                username: username || email.split('@')[0], // 이메일의 @ 앞부분을 기본 사용자명으로 사용
                profilePicture: null, // 회원가입 시에는 프로필 이미지 없음
            },
        });

        const userInfo = {
            id: user.id,
            email: user.email,
            username: user.username,
            win: user.win,
            lose: user.lose,
            profilePicture: user.profilePicture,
            isRegistered: !!user.username,
        };

        res.json(userInfo);
    } catch (error) {
        console.error("Error creating/updating user:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// 사용자 통계 업데이트 라우트
app.patch("/user/:email/stats", async (req: Request, res: Response) => {
    try {
        const { email } = req.params;
        const { win, lose } = req.body;
        
        if (!email) {
            res.status(400).json({ error: "Email parameter is required" });
            return;
        }

        const user = await prisma.user.update({
            where: { email },
            data: {
                win: win !== undefined ? win : undefined,
                lose: lose !== undefined ? lose : undefined,
            },
        });

        const userInfo = {
            id: user.id,
            email: user.email,
            username: user.username,
            win: user.win,
            lose: user.lose,
            profilePicture: user.profilePicture,
            isRegistered: !!user.username,
        };

        res.json(userInfo);
    } catch (error) {
        console.error("Error updating user stats:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// 프로필 업데이트 라우트 (파일 업로드 포함)
app.post("/user/profile/update", upload.single('image'), async (req: Request, res: Response) => {
    try {
        const { email, username } = req.body;
        
        if (!email) {
            res.status(400).json({ error: "Email is required" });
            return;
        }

        if (!username) {
            res.status(400).json({ error: "Username is required" });
            return;
        }

        // 업로드된 파일 처리
        let profilePicturePath = null;
        if (req.file) {
            profilePicturePath = `/uploads/${req.file.filename}`;
        }

        // 사용자 정보 업데이트
        const user = await prisma.user.update({
            where: { email },
            data: {
                username,
                ...(profilePicturePath && { profilePicture: profilePicturePath }),
            },
        });

        const userInfo = {
            id: user.id,
            email: user.email,
            username: user.username,
            win: user.win,
            lose: user.lose,
            profilePicture: user.profilePicture,
            isRegistered: !!user.username,
        };

        res.json({ 
            message: "프로필 업데이트 성공", 
            user: userInfo 
        });
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Socket.IO 연결 테스트 엔드포인트
app.get("/socket/test", (req: Request, res: Response) => {
    const connectedClients = io.sockets.sockets.size;
    res.json({
        message: "Socket.IO server is running",
        connectedClients: connectedClients,
        timestamp: new Date().toISOString()
    });
});

// 소켓 핸들러 설정
setupSocketHandlers(io);

const PORT = process.env.PORT || 4000;

const server = httpServer.listen(PORT, () => {
    const isProduction = process.env.NODE_ENV === 'production';
    const protocol = isProduction ? 'https' : 'http';
    
    console.log(`🚀 Socket server running on ${protocol}://localhost:${PORT}`);
    console.log(`📡 Client URL: ${process.env.CLIENT_URL || "http://localhost:3000"}`);
    console.log(`🗄️ Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
    
    if (isProduction) {
        console.log('🔒 HTTPS는 클라우드 플랫폼에서 자동으로 처리됩니다');
    } else {
        console.log('🔓 개발 환경에서 HTTP로 실행 중');
    }
}).on('error', (error) => {
    console.error('❌ 서버 시작 오류:', error);
    process.exit(1);
});

// 정상적인 종료 처리
process.on('SIGTERM', () => {
    console.log('💤 SIGTERM 신호 받음. 서버를 정상적으로 종료합니다...');
    server.close(() => {
        console.log('✅ HTTP 서버 종료 완료');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('💤 SIGINT 신호 받음. 서버를 정상적으로 종료합니다...');
    server.close(() => {
        console.log('✅ HTTP 서버 종료 완료');
        process.exit(0);
    });
});

// 처리되지 않은 오류 처리
process.on('uncaughtException', (error) => {
    console.error('🚨 처리되지 않은 예외:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 처리되지 않은 Promise 거부:', reason);
    process.exit(1);
});
