import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import type { AppDatabase } from "./db";
import { PortalRepository } from "./repository";
import { authenticateCustomer, createSession, deleteSession, requireSession } from "./auth";
import { createDisputeSchema, createSessionSchema } from "./validators";

export function createApp(db: AppDatabase, clientDistDir?: string) {
  const app = express();
  const repository = new PortalRepository(db);

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.post("/api/session", (request, response) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid sign-in details." });
      return;
    }

    const customer = authenticateCustomer(db, parsed.data.email, parsed.data.password);
    if (!customer) {
      response.status(401).json({ message: "The email address or password is incorrect." });
      return;
    }

    response.status(201).json(createSession(db, customer));
  });

  const authenticate = requireSession(db);

  app.get("/api/session", authenticate, (_request, response) => {
    response.json({ customer: response.locals.customer });
  });

  app.delete("/api/session", authenticate, (_request, response) => {
    deleteSession(db, response.locals.accessToken);
    response.status(204).send();
  });

  app.get("/api/dashboard", authenticate, (_request, response) => {
    response.json(repository.getSummary(response.locals.customer.id));
  });

  app.get("/api/transactions", authenticate, (_request, response) => {
    response.json({ transactions: repository.listTransactions(response.locals.customer.id) });
  });

  app.get("/api/disputes", authenticate, (_request, response) => {
    response.json({ disputes: repository.listDisputes(response.locals.customer.id) });
  });

  app.post("/api/disputes", authenticate, (request, response) => {
    const parsed = createDisputeSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
      return;
    }

    try {
      const dispute = repository.createDispute(response.locals.customer.id, parsed.data);
      response.status(201).json({ dispute });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create dispute.";
      response.status(/not found/i.test(message) ? 404 : 409).json({ message });
    }
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({ message: "API route not found." });
  });

  if (clientDistDir && fs.existsSync(clientDistDir)) {
    app.use(express.static(clientDistDir));

    app.use((request, response, next) => {
      if (request.path.startsWith("/api")) {
        next();
        return;
      }

      response.sendFile(path.join(clientDistDir, "index.html"));
    });
  }

  return app;
}
