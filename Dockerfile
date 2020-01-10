FROM node:12-alpine

RUN mkdir -p /opt/app

WORKDIR /opt/app

# copy dependencies first so these can get cached separately
COPY package.json /opt/app
COPY yarn.lock /opt/app
RUN yarn install

COPY . /opt/app
RUN yarn build

ENV NODE_ENV production
ENV PORT 9005
ENV SQLITE_DB /tmp/mailthing.db
EXPOSE 9005
EXPOSE 2500

CMD [ "npm", "start" ]
