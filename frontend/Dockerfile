FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
EXPOSE 10080
CMD ["npm", "run", "dev", "--", "--host"]
