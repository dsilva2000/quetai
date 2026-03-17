import { pgTable, text, integer, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Perfil del adulto mayor
export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  nombreCompleto: text("nombre_completo").notNull(),
});

export const insertUsuarioSchema = createInsertSchema(usuarios).omit({ id: true });
export type InsertUsuario = z.infer<typeof insertUsuarioSchema>;
export type Usuario = typeof usuarios.$inferSelect;

// Medicamentos guardados por conversación
export const medicamentos = pgTable("medicamentos", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  nombre: text("nombre").notNull(),
  horario: text("horario").notNull(),
  activo: boolean("activo").notNull().default(true),
});

export const insertMedicamentoSchema = createInsertSchema(medicamentos).omit({ id: true });
export type InsertMedicamento = z.infer<typeof insertMedicamentoSchema>;
export type Medicamento = typeof medicamentos.$inferSelect;

// Mensajes de conversación
export const mensajes = pgTable("mensajes", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  rol: text("rol").notNull(), // "user" | "assistant"
  contenido: text("contenido").notNull(),
  orden: integer("orden").notNull(),
});

export const insertMensajeSchema = createInsertSchema(mensajes).omit({ id: true });
export type InsertMensaje = z.infer<typeof insertMensajeSchema>;
export type Mensaje = typeof mensajes.$inferSelect;
