# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Set API_BASE at build time. 
# This will be overridden by the actual URL during the deployment process.
ARG API_BASE
ENV API_BASE=$API_BASE

RUN npm run build

# Final stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
