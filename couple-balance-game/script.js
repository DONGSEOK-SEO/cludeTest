const screens = {
  start: document.getElementById("start-screen"),
  count: document.getElementById("count-screen"),
  questionsForm: document.getElementById("questions-form-screen"),
  handoff: document.getElementById("handoff-screen"),
  question: document.getElementById("question-screen"),
  reveal: document.getElementById("reveal-screen"),
  result: document.getElementById("result-screen"),
};

let QUESTIONS = [];
let currentIndex = 0;
let currentPlayer = 1;
let player1Choice = null;
let matchCount = 0;

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

function goToCount() {
  showScreen("count");
}

function goToQuestionsForm() {
  const count = Number(document.getElementById("count-input").value);
  if (!Number.isInteger(count) || count < 1 || count > 30) {
    return;
  }

  const form = document.getElementById("questions-form");
  form.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const item = document.createElement("div");
    item.className = "question-form-item";
    item.innerHTML = `
      <span class="q-label">질문 ${i + 1}</span>
      <div class="pair-input">
        <input type="text" class="q-option-a" placeholder="선택지 A" maxlength="30">
        <input type="text" class="q-option-b" placeholder="선택지 B" maxlength="30">
      </div>
    `;
    form.appendChild(item);
  }
  document.querySelector(".form-error").textContent = "";
  showScreen("questionsForm");
}

function submitQuestionsForm() {
  const items = document.querySelectorAll(".question-form-item");
  const questions = [];
  for (const item of items) {
    const a = item.querySelector(".q-option-a").value.trim();
    const b = item.querySelector(".q-option-b").value.trim();
    if (!a || !b) {
      document.querySelector(".form-error").textContent = "모든 질문의 선택지 A, B를 입력해주세요.";
      return;
    }
    questions.push({ a, b });
  }
  QUESTIONS = questions;
  startGame();
}

function startGame() {
  currentIndex = 0;
  matchCount = 0;
  goToHandoff(1);
}

function goToHandoff(player) {
  currentPlayer = player;
  const text =
    player === 1
      ? "플레이어 1 차례예요.<br>휴대폰을 플레이어 1에게 건네주세요."
      : "이제 플레이어 2 차례예요!<br>휴대폰을 플레이어 2에게 건네주세요.";
  document.querySelector(".handoff-text").innerHTML = text;
  showScreen("handoff");
}

function goToQuestion() {
  const q = QUESTIONS[currentIndex];
  document.querySelector(".progress").textContent = `질문 ${currentIndex + 1} / ${QUESTIONS.length}`;
  document.querySelector(".player-label").textContent = `플레이어 ${currentPlayer}`;
  document.querySelector(".question").textContent = "둘 중 하나를 골라보세요";
  document.getElementById("option-a").textContent = q.a;
  document.getElementById("option-b").textContent = q.b;
  showScreen("question");
}

function chooseOption(choice) {
  if (currentPlayer === 1) {
    player1Choice = choice;
    goToHandoff(2);
  } else {
    revealResult(player1Choice, choice);
  }
}

function revealResult(p1, p2) {
  const q = QUESTIONS[currentIndex];
  const isMatch = p1 === p2;
  if (isMatch) matchCount++;

  document.querySelector(".reveal-question").textContent = `${q.a} vs ${q.b}`;

  const p1Box = document.getElementById("reveal-p1");
  const p2Box = document.getElementById("reveal-p2");
  p1Box.querySelector(".reveal-choice").textContent = p1 === "a" ? q.a : q.b;
  p2Box.querySelector(".reveal-choice").textContent = p2 === "a" ? q.a : q.b;

  p1Box.classList.remove("match", "mismatch");
  p2Box.classList.remove("match", "mismatch");
  p1Box.classList.add(isMatch ? "match" : "mismatch");
  p2Box.classList.add(isMatch ? "match" : "mismatch");

  const resultEl = document.querySelector(".match-result");
  resultEl.classList.remove("match", "mismatch");
  if (isMatch) {
    resultEl.textContent = "🎉 선택이 일치했어요!";
    resultEl.classList.add("match");
  } else {
    resultEl.textContent = "서로 다른 선택을 했네요!";
    resultEl.classList.add("mismatch");
  }

  showScreen("reveal");
}

function nextQuestion() {
  currentIndex++;
  player1Choice = null;
  if (currentIndex >= QUESTIONS.length) {
    showResult();
  } else {
    goToHandoff(1);
  }
}

function showResult() {
  const percent = Math.round((matchCount / QUESTIONS.length) * 100);
  document.querySelector(".score").textContent = `${matchCount} / ${QUESTIONS.length} 일치 (${percent}%)`;

  let message;
  if (percent >= 80) {
    message = "천생연분이네요! 거의 모든 순간을 같은 마음으로 보내고 있어요 💕";
  } else if (percent >= 50) {
    message = "꽤 잘 맞는 커플이에요! 다른 부분은 서로 맞춰가며 더 재밌게 지낼 수 있어요 😊";
  } else {
    message = "서로 다른 매력을 가진 커플이네요! 다름을 알아가는 재미가 있을 거예요 🌈";
  }
  document.querySelector(".message").textContent = message;

  showScreen("result");
}

document.getElementById("start-btn").addEventListener("click", goToCount);
document.getElementById("count-next-btn").addEventListener("click", goToQuestionsForm);
document.getElementById("questions-submit-btn").addEventListener("click", submitQuestionsForm);
document.getElementById("handoff-btn").addEventListener("click", goToQuestion);
document.getElementById("option-a").addEventListener("click", () => chooseOption("a"));
document.getElementById("option-b").addEventListener("click", () => chooseOption("b"));
document.getElementById("next-btn").addEventListener("click", nextQuestion);
document.getElementById("restart-btn").addEventListener("click", goToCount);
