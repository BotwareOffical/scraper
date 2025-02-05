FROM mcr.microsoft.com/playwright:v1.50.0-focal

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 10000

CMD ["node", "app.js"]