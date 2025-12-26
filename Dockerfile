FROM gcr.io/distroless/nodejs24-debian13:nonroot
COPY . /app
WORKDIR /app
CMD ["cli.js"]
