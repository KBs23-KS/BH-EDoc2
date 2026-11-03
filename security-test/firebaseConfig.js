// Public Firebase WEB config for the isolated test project only.
// Never copy production service-account keys, credentials or teacher data here.
export const TEST_PROJECT_ID = "bhs-edoc-security-test";

export const firebaseConfig = Object.freeze({
  apiKey: "AIzaSyD6XnFVHEgNtec7FCTzG5UAl5g6DToh9tI",
  authDomain: "bhs-edoc-security-test.firebaseapp.com",
  projectId: TEST_PROJECT_ID,
  storageBucket: "bhs-edoc-security-test.firebasestorage.app",
  messagingSenderId: "497188458352",
  appId: "1:497188458352:web:1c590f6765660e96ba49b5",
});

export function verifyTestProject(config = firebaseConfig) {
  if (config.projectId !== TEST_PROJECT_ID ||
      config.authDomain !== TEST_PROJECT_ID + ".firebaseapp.com" ||
      config.storageBucket !== TEST_PROJECT_ID + ".firebasestorage.app" ||
      config.messagingSenderId !== "497188458352" ||
      config.appId !== "1:497188458352:web:1c590f6765660e96ba49b5") {
    throw new Error("Firebase project mismatch. Test app refuses to initialize.");
  }
  return config;
}
