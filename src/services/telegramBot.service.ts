import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import FormData from "form-data";
import QRCode from "qrcode";
import { env } from "../config/env";
import { logger } from "../utils/logger";

type Step =
  | "AWAIT_START"
  | "ASK_TICKETS"
  | "ASK_OWNER_NAME"
  | "ASK_OWNER_PHONE"
  | "ASK_SCREENSHOT";

type Owner = {
  name: string;
  phone: string;
};

type UserState = {
  step: Step;
  telegramId: string;
  username: string;
  ticketCount?: number;
  owners?: Owner[];
  currentOwnerIndex?: number;
  currentOwnerName?: string;
};

const START_LABEL = "▶️ Start";
const BACK_LABEL = "⬅️ Back";

let bot: TelegramBot | null = null;

const userStates = new Map<number, UserState>();

function getBackendUrl(): string {
  return process.env.BACKEND_URL || `http://localhost:${env.port}`;
}

function getOrInitState(chatId: number, msg: TelegramBot.Message): UserState {
  const existing = userStates.get(chatId);
  if (existing) {
    return existing;
  }

  const telegramId = String(msg.from?.id ?? chatId);
  const username = msg.from?.username ?? "";

  const state: UserState = {
    step: "AWAIT_START",
    telegramId,
    username
  };
  userStates.set(chatId, state);
  return state;
}

async function showStart(chatId: number): Promise<void> {
  const existing = userStates.get(chatId);
  const telegramId = existing?.telegramId ?? String(chatId);
  const username = existing?.username ?? "";

  const state: UserState = {
    step: "AWAIT_START",
    telegramId,
    username
  };
  userStates.set(chatId, state);

  if (!bot) return;

  await bot.sendMessage(chatId, "Tap Start to begin a new transaction.", {
    reply_markup: {
      keyboard: [[{ text: START_LABEL }, { text: BACK_LABEL }]],
      resize_keyboard: true
    }
  });
}

async function beginTransaction(chatId: number, state: UserState): Promise<void> {
  if (!bot) return;

  const telegramId = state.telegramId;
  const username = state.username;

  Object.keys(state).forEach((key) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (state as any)[key];
  });

  state.telegramId = telegramId;
  state.username = username;
  state.step = "ASK_TICKETS";

  await bot.sendMessage(
    chatId,
    "How many tickets do you want? (Send a number like 1, 2, 3...)",
    {
      reply_markup: {
        keyboard: [[{ text: START_LABEL }, { text: BACK_LABEL }]],
        resize_keyboard: true
      }
    }
  );
}

async function handleStartCommand(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  if (!msg.chat || msg.chat.id === undefined) return;

  const chatId = msg.chat.id;

  const telegramId = String(msg.from?.id ?? chatId);
  const username = msg.from?.username ?? "";

  userStates.set(chatId, {
    step: "AWAIT_START",
    telegramId,
    username
  });

  await bot.sendMessage(
    chatId,
    "👋 Welcome to the MMD Event payment bot.\n\nTap Start to begin a new transaction.",
    {
      reply_markup: {
        keyboard: [[{ text: START_LABEL }, { text: BACK_LABEL }]],
        resize_keyboard: true
      }
    }
  );
}

async function handleHelpCommand(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  if (!msg.chat || msg.chat.id === undefined) return;

  await bot.sendMessage(
    msg.chat.id,
    "Use /start to begin the payment verification process."
  );
}

async function handleTextMessage(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  if (!msg.chat || msg.chat.id === undefined) return;

  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();

  const state = getOrInitState(chatId, msg);
  const step = state.step;

  if (text === START_LABEL || text.toLowerCase() === "start") {
    await beginTransaction(chatId, state);
    return;
  }

  if (step === "AWAIT_START") {
    await bot.sendMessage(chatId, "Tap Start to begin a new transaction.", {
      reply_markup: {
        keyboard: [[{ text: START_LABEL }, { text: BACK_LABEL }]],
        resize_keyboard: true
      }
    });
    return;
  }

  if (text === BACK_LABEL || text.toLowerCase() === "back") {
    if (step === "ASK_TICKETS") {
      await bot.sendMessage(
        chatId,
        "You are at the first step. Please enter how many tickets you want.",
        {
          reply_markup: {
            keyboard: [[{ text: START_LABEL }, { text: BACK_LABEL }]],
            resize_keyboard: true
          }
        }
      );
      return;
    }

    if (step === "ASK_OWNER_NAME" || step === "ASK_OWNER_PHONE") {
      const owners = state.owners ?? [];
      const index = state.currentOwnerIndex ?? 1;

      if (step === "ASK_OWNER_PHONE") {
        state.step = "ASK_OWNER_NAME";
        await bot.sendMessage(
          chatId,
          `Okay, please re-send the full name for ticket #${index}.`,
          {
            reply_markup: {
              keyboard: [[{ text: BACK_LABEL }]],
              resize_keyboard: true
            }
          }
        );
        return;
      }

      if (index > 1) {
        if (owners.length > 0) {
          owners.pop();
          state.owners = owners;
        }
        state.currentOwnerIndex = index - 1;
        state.step = "ASK_OWNER_NAME";
        await bot.sendMessage(
          chatId,
          `Okay, please update the full name for ticket #${state.currentOwnerIndex}.`,
          {
            reply_markup: {
              keyboard: [[{ text: START_LABEL }, { text: BACK_LABEL }]],
              resize_keyboard: true
            }
          }
        );
        return;
      }

      state.step = "ASK_TICKETS";
      delete state.owners;
      delete state.currentOwnerIndex;

      await bot.sendMessage(chatId, "Okay, how many tickets do you want now?", {
        reply_markup: {
          keyboard: [[{ text: START_LABEL }, { text: BACK_LABEL }]],
          resize_keyboard: true
        }
      });
      return;
    }

    if (step === "ASK_SCREENSHOT") {
      await showStart(chatId);
      return;
    }
  }

  if (step === "ASK_TICKETS") {
    const normalized = text.replace(/\s+/g, "");
    const ticketCount = Number.parseInt(normalized, 10);

    if (!Number.isFinite(ticketCount) || ticketCount < 1 || ticketCount > 50) {
      await bot.sendMessage(chatId, "Please send a valid ticket count (1 - 50).");
      return;
    }

    state.ticketCount = ticketCount;
    state.owners = [];
    state.currentOwnerIndex = 1;
    state.step = "ASK_OWNER_NAME";

    await bot.sendMessage(
      chatId,
      `Please send the full name for ticket #${state.currentOwnerIndex}.`,
      {
        reply_markup: {
          keyboard: [[{ text: START_LABEL }, { text: BACK_LABEL }]],
          resize_keyboard: true
        }
      }
    );
    return;
  }

  if (step === "ASK_OWNER_NAME") {
    const index = state.currentOwnerIndex ?? 1;
    const name = text.trim();

    if (!name) {
      await bot.sendMessage(
        chatId,
        "Name cannot be empty. Please send the full name."
      );
      return;
    }

    state.currentOwnerName = name;
    state.step = "ASK_OWNER_PHONE";

    await bot.sendMessage(
      chatId,
      `Now send the phone number for ticket #${index} (10 digits, must start with 09).`,
      {
        reply_markup: {
          keyboard: [[{ text: START_LABEL }, { text: BACK_LABEL }]],
          resize_keyboard: true
        }
      }
    );
    return;
  }

  if (step === "ASK_OWNER_PHONE") {
    const index = state.currentOwnerIndex ?? 1;
    const normalized = (text.match(/\d/g) ?? []).join("");

    if (!(normalized.length === 10 && normalized.startsWith("09"))) {
      await bot.sendMessage(
        chatId,
        "Please enter a valid phone number (10 digits, starts with 09)."
      );
      return;
    }

    const owners = state.owners ?? [];
    owners.push({
      name: state.currentOwnerName ?? "",
      phone: normalized
    });
    state.owners = owners;
    delete state.currentOwnerName;

    const ticketCount = state.ticketCount ?? 1;

    if (index < ticketCount) {
      state.currentOwnerIndex = index + 1;
      state.step = "ASK_OWNER_NAME";
      await bot.sendMessage(
        chatId,
        `Please send the full name for ticket #${state.currentOwnerIndex}.`,
        {
          reply_markup: {
            keyboard: [[{ text: START_LABEL }, { text: BACK_LABEL }]],
            resize_keyboard: true
          }
        }
      );
      return;
    }

    const primary = owners[0];

    try {
      const backendUrl = getBackendUrl();
      await axios.post(
        `${backendUrl}/api/users/register`,
        {
          telegramId: state.telegramId,
          fullName: primary.name,
          username: state.username ?? "",
          phoneNumber: primary.phone,
          ticketCount: state.ticketCount ?? 1
        },
        { timeout: 10_000 }
      );
    } catch (err) {
      logger.error("Error registering user from Telegram bot", { err });
      await bot.sendMessage(
        chatId,
        "There was an error saving your details. Please try again later."
      );
      return;
    }

    state.step = "ASK_SCREENSHOT";

    await bot.sendMessage(
      chatId,
      "Great. Now please upload a clear screenshot of your payment receipt.",
      {
        reply_markup: {
          remove_keyboard: true
        }
      }
    );
    return;
  }

  await bot.sendMessage(chatId, "Tap Start to begin a new transaction.", {
    reply_markup: {
      keyboard: [[{ text: START_LABEL }, { text: BACK_LABEL }]],
      resize_keyboard: true
    }
  });
}

async function handlePhotoMessage(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  if (!msg.chat || msg.chat.id === undefined) return;

  const chatId = msg.chat.id;
  const state = userStates.get(chatId);

  if (!state || state.step !== "ASK_SCREENSHOT") {
    await bot.sendMessage(
      chatId,
      "Tap Start to begin a new transaction, then follow the steps before sending a screenshot.",
      {
        reply_markup: {
          keyboard: [[{ text: START_LABEL }, { text: BACK_LABEL }]],
          resize_keyboard: true
        }
      }
    );
    return;
  }

  const photos = msg.photo;
  if (!photos || photos.length === 0) {
    await bot.sendMessage(chatId, "Please send a valid payment screenshot.");
    return;
  }

  const largestPhoto = photos[photos.length - 1];

  try {
    const fileLink = await bot.getFileLink(largestPhoto.file_id);
    const imageResp = await axios.get<ArrayBuffer>(fileLink, {
      responseType: "arraybuffer",
      timeout: 30_000
    });

    const form = new FormData();
    form.append("file", Buffer.from(imageResp.data), {
      filename: "payment.jpg",
      contentType: "image/jpeg"
    });
    form.append("telegramId", state.telegramId);
    form.append("owners", JSON.stringify(state.owners ?? []));

    const backendUrl = getBackendUrl();

    const resp = await axios.post(`${backendUrl}/api/payments/submit`, form, {
      headers: form.getHeaders(),
      timeout: 30_000
    });

    const result = resp.data as {
      verified?: boolean;
      ticketCount?: number;
      tickets?: { ownerName: string; ownerPhone: string; qrPayload: string }[];
      amount?: string;
      reference?: string;
      message?: string;
    };

    if (result.verified) {
      const tickets = result.tickets ?? [];
      const ticketCount = result.ticketCount === undefined ? tickets.length : 1;

      await bot.sendMessage(
        chatId,
        [
          "🎟 Your payment has been verified successfully!",
          "",
          `Tickets (${ticketCount}):`,
          `Amount: ${result.amount ?? "N/A"}`,
          `Reference: ${result.reference ?? "N/A"}`,
          "",
          "Below are your ticket(s). Please keep them for event day."
        ].join("\n")
      );

      if (tickets.length > 0) {
        for (let i = 0; i < tickets.length; i += 1) {
          const t = tickets[i];
          const caption = `Ticket #${i + 1}\nName: ${t.ownerName}\nPhone: ${t.ownerPhone}`;

          if (t.qrPayload) {
            try {
              const buffer = await QRCode.toBuffer(t.qrPayload, {
                type: "png"
              });

              await bot.sendPhoto(chatId, buffer, { caption });
            } catch (err) {
              logger.error("Failed to generate QR code image", { err });
              await bot.sendMessage(
                chatId,
                `${caption}\nQR: ${t.qrPayload}`
              );
            }
          } else {
            await bot.sendMessage(chatId, caption);
          }
        }
      }

      await showStart(chatId);
    } else {
      await bot.sendMessage(
        chatId,
        [
          "❌ Your payment could not be verified.",
          `Message: ${result.message ?? "Verification failed."}`,
          "",
          "You can try sending another screenshot or contact support."
        ].join("\n"),
        {
          reply_markup: {
            keyboard: [[{ text: START_LABEL }, { text: BACK_LABEL }]],
            resize_keyboard: true
          }
        }
      );
      await showStart(chatId);
    }
  } catch (err) {
    logger.error("Error verifying payment from Telegram bot", { err });

    await bot.sendMessage(
      chatId,
      "There was an error verifying your payment. Please try again.",
      {
        reply_markup: {
          keyboard: [[{ text: START_LABEL }, { text: BACK_LABEL }]],
          resize_keyboard: true
        }
      }
    );
    await showStart(chatId);
  }
}

export function startTelegramBot(): void {
  const token = process.env.BOT_TOKEN;

  if (!token) {
    logger.warn("BOT_TOKEN is not set; Telegram bot will not be started.");
    return;
  }

  if (bot) {
    logger.info("Telegram bot is already running.");
    return;
  }

  bot = new TelegramBot(token, {
    polling: true
  });

  logger.info("Telegram bot polling started.");

  bot.onText(/^\/start(?:@[\w_]+)?$/i, (msg: any) => {
    void handleStartCommand(msg);
  });

  bot.onText(/^\/help(?:@[\w_]+)?$/i, (msg: any) => {
    void handleHelpCommand(msg);
  });

  bot.on("message", (msg: any) => {
    if (!msg.text || msg.text.startsWith("/")) {
      return;
    }
    void handleTextMessage(msg);
  });

  bot.on("photo", (msg: any) => {
    void handlePhotoMessage(msg);
  });
}

