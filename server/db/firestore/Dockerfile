# Firebase Emulator (Firestore) para el Centro Médico Pediátrico.
# No existe imagen oficial: Node 22 + JRE 21 (requerido por firebase-tools 14).
FROM eclipse-temurin:21-jre AS jre

FROM node:22-bookworm-slim
COPY --from=jre /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk PATH="/opt/java/openjdk/bin:${PATH}"
RUN npm install -g firebase-tools@14 && firebase setup:emulators:firestore
WORKDIR /firebase
COPY firebase.json firestore.rules firestore.indexes.json ./
EXPOSE 8080
CMD ["firebase", "emulators:start", "--only", "firestore", "--project", "demo-red-clinica"]
