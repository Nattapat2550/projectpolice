const express = require("express");
const cookieParser = require("cookie-parser");
const expressMongoSanitize = require("@exortek/express-mongo-sanitize");
const helmet = require("helmet");
const { xss } = require("express-xss-sanitizer");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const cors = require("cors");
const morgan = require("morgan");
const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

// นำเข้า Routes (ต้องแน่ใจว่าไฟล์เหล่านี้มีอยู่จริงและเขียนโค้ดตามด้านบน)
const auth = require("./routes/auth");
const pdf = require("./routes/pdf");

const app = express();

const swaggerOptions = {
  swaggerDefinition: {
    openapi: "3.0.0",
    info: {
      title: "Core API",
      version: "1.0.0",
      description: "API for Authentication and PDF Scanning",
    },
    servers: [{ url: "http://localhost:5555/api/v1" }],
  },
  apis: ["./routes/*.js"],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.use(cors());
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());
app.use(expressMongoSanitize());
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

// เปิดใช้งานเฉพาะ Routes ที่เราเตรียมไว้
app.use("/api/v1/auth", auth);
app.use("/api/v1/pdf", pdf);

app.set("query parser", "extended");

module.exports = app;