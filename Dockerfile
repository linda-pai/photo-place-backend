FROM node:18-alpine

WORKDIR /usr/src/app

ENV NODE_ENV production

# 安装 gif-encoder 依赖
RUN apk add --no-cache python3 make g++ libc6-compat \
    cairo-dev pango-dev giflib-dev

COPY package.json yarn.lock ./

RUN yarn install --ignore-engines

# 安装平台特定的 sharp 依赖
RUN npm install --os=linux --libc=musl --cpu=arm64 sharp

COPY . .

EXPOSE 3001
CMD [ "node", "server" ]