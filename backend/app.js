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

const auth = require("./routes/auth");
const users = require("./routes/users");
const documents = require("./routes/documents");
const tasks = require("./routes/tasks"); 

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
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    process.env.FRONTEND
  ].filter(Boolean),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
};
app.use(cors(corsOptions));

if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());
app.use(helmet());
app.use(xss());
app.use(hpp());

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  handler: (req, res) => {
    res.status(429).json({ success: false, message: "Too Many Requests" });
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  handler: (req, res) => {
    res.status(429).json({ success: false, message: "Too Many Requests" });
  },
});

// 🔒 เพิ่ม Limiter สำหรับการใช้งานไฟล์หนักๆ (ป้องกัน Resource Exhaustion/DoS)
const documentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // จำกัดการอัปโหลดไฟล์/ดึงไฟล์ ต่อ IP
  handler: (req, res) => {
    res.status(429).json({ success: false, message: "Too many document requests. Please try again later." });
  },
});

app.use("/api/v1/auth", authLimiter, auth);
app.use("/api/v1/users", users);
// 🔒 ใช้งาน limiter กับ route documents
app.use("/api/v1/documents", documentLimiter, documents); 
app.use("/api/v1/tasks", tasks); 
app.set("query parser", "extended");

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Project Police API is running securely."
  });
});

module.exports = app;