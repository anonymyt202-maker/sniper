FROM node:20-slim

# apt orqali kerakli paketlarni o'rnatish (yt-dlp, ffmpeg va h.k.)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp'ni eng so'nggi versiyasini o'rnatish (Node.js JS runtime sifatida ishlatiladi)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && yt-dlp --version

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["npm", "start"]
