export default {
  scheduled(event, env, ctx) {
    console.log("Hello world 👋 Scheduled worker ran at:", new Date().toISOString());
  }
};