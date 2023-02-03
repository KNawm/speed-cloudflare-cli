FROM gcr.io/distroless/nodejs18:nonroot
COPY . /app
WORKDIR /app
CMD ["cli.js"]
