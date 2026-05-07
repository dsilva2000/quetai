FROM node:20-slim

# Instalar dependencias para better-sqlite3 (requiere Python + gcc)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --omit=dev

# Copiar el build pre-compilado
COPY dist/ ./dist/

# Crear directorio de datos (será sobreescrito por el volumen)
RUN mkdir -p /app/data

EXPOSE 8080

CMD ["node", "dist/index.cjs"]
