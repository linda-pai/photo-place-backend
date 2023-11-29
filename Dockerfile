FROM node:18-alpine

WORKDIR /usr/src/app

ENV NODE_ENV production

COPY package.json yarn.lock ./

RUN yarn install

COPY . .

EXPOSE 3001
CMD [ "node", "server" ]