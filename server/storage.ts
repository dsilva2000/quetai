import {
  usuarios, medicamentos, mensajes,
  type InsertUsuario, type Usuario,
  type InsertMedicamento, type Medicamento,
  type InsertMensaje, type Mensaje,
} from "@shared/schema";

export interface IStorage {
  // Usuarios
  getUsuario(sessionId: string): Promise<Usuario | undefined>;
  createUsuario(data: InsertUsuario): Promise<Usuario>;

  // Medicamentos
  getMedicamentos(sessionId: string): Promise<Medicamento[]>;
  addMedicamento(data: InsertMedicamento): Promise<Medicamento>;

  // Mensajes
  getMensajes(sessionId: string): Promise<Mensaje[]>;
  addMensaje(data: InsertMensaje): Promise<Mensaje>;
  clearMensajes(sessionId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private usuarios: Map<string, Usuario> = new Map();
  private medicamentos: Map<number, Medicamento> = new Map();
  private mensajes: Map<number, Mensaje> = new Map();
  private nextId = 1;

  async getUsuario(sessionId: string): Promise<Usuario | undefined> {
    return [...this.usuarios.values()].find(u => u.sessionId === sessionId);
  }

  async createUsuario(data: InsertUsuario): Promise<Usuario> {
    const u: Usuario = { id: this.nextId++, ...data };
    this.usuarios.set(u.sessionId, u);
    return u;
  }

  async getMedicamentos(sessionId: string): Promise<Medicamento[]> {
    return [...this.medicamentos.values()].filter(m => m.sessionId === sessionId && m.activo);
  }

  async addMedicamento(data: InsertMedicamento): Promise<Medicamento> {
    const m: Medicamento = { id: this.nextId++, ...data };
    this.medicamentos.set(m.id, m);
    return m;
  }

  async getMensajes(sessionId: string): Promise<Mensaje[]> {
    return [...this.mensajes.values()]
      .filter(m => m.sessionId === sessionId)
      .sort((a, b) => a.orden - b.orden);
  }

  async addMensaje(data: InsertMensaje): Promise<Mensaje> {
    const m: Mensaje = { id: this.nextId++, ...data };
    this.mensajes.set(m.id, m);
    return m;
  }

  async clearMensajes(sessionId: string): Promise<void> {
    for (const [id, m] of this.mensajes.entries()) {
      if (m.sessionId === sessionId) this.mensajes.delete(id);
    }
  }
}

export const storage = new MemStorage();
