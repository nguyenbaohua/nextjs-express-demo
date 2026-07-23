import cors from "cors";
import express from "express";
import { errorHandler } from "./middlewares/errorHandler";
import { notFound } from "./middlewares/notFound";
import todoRoutes from "./routes/todo.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/todos", todoRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
