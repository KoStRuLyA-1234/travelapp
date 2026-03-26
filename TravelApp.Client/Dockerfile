FROM node:22-alpine AS build
WORKDIR /app

# librsvg provides rsvg-convert — needed to generate PNG icons from SVG
RUN apk add --no-cache librsvg

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .

RUN npm run build -- --configuration production

FROM nginx:alpine
COPY --from=build /app/dist/travel-app/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
