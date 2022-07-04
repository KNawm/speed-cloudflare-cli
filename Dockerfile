FROM gcr.io/distroless/nodejs:18
COPY . /app
WORKDIR /app
CMD ["cli.js"]