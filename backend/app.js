const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const { xss } = require("express-xss-sanitizer");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const cors = require("cors");
const morgan = require("morgan");
const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const path = require("path");

const auth = require("./routes/auth");
const users = require("./routes/users");
const documents = require("./routes/documents");
const tasks = require("./routes/tasks"); 
const webhooks = require("./routes/webhooks");

const app = express();

const swaggerOptions = {
  swaggerDefinition: {
    openapi: "3.0.0",
    info: {
      title: "Library API",
      version: "1.0.0",
      description: "API for managing dentist appointments, schedules, and user bookings",
    },
    servers: [{ url: `${process.env.API_BASE_URL}/api/v1` }],
  },
  apis: ["./routes/*.js"],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman, etc.)
    if (!origin) return callback(null, true);

    // Allow localhost on any port
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // Allow all Vercel and Render domains (e.g. projectpolice-iota.vercel.app, projectpolice-um54.vercel.app)
    if (origin.endsWith('.vercel.app') || origin.includes('.vercel.app') || origin.includes('.onrender.com')) {
      return callback(null, true);
    }

    // Allow origins listed in process.env.FRONTEND (comma-separated or single)
    if (process.env.FRONTEND) {
      const allowedOrigins = process.env.FRONTEND.split(',').map(s => s.trim().replace(/\/$/, ''));
      const normalizedOrigin = origin.replace(/\/$/, '');
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }
    }

    // Default fallback to allow origin
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(xss());
app.use(hpp());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  skip: (req) => req.method === "OPTIONS",
  handler: (req, res) => {
    res.status(429).json({ success: false, message: "Too Many Requests" });
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  skip: (req) => req.method === "OPTIONS",
  handler: (req, res) => {
    res.status(429).json({ success: false, message: "Too Many Requests" });
  },
});

// 🔒 เพิ่ม Limiter สำหรับการใช้งานไฟล์หนักๆ (ป้องกัน Resource Exhaustion/DoS)
const documentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // จำกัดการอัปโหลดไฟล์/ดึงไฟล์ ต่อ IP
  skip: (req) => req.method === "OPTIONS",
  handler: (req, res) => {
    res.status(429).json({ success: false, message: "Too many document requests. Please try again later." });
  },
});

app.use("/api/v1/auth", authLimiter, auth);
app.use("/api/v1/users", users);
// 🔒 ใช้งาน limiter กับ route documents
app.use("/api/v1/documents", documentLimiter, documents); 
app.use("/api/v1/tasks", tasks); 
app.use("/api/v1/webhooks", webhooks); // Mount webhook endpoints
app.set("query parser", "extended");

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Project Police API is running securely."
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
});

module.exports = app;