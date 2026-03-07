import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import { env } from "../config/env";

export interface VerificationResult {
  verified: boolean;
  verificationType: "cbe" | "telebirr";
  reference: string;
  amount: string;
  payer: string;
  receiver: string;
  date: Date;
  rawDetails: any;
}

type InitialImagePayload = {
  type?: "cbe" | "telebirr";
  reference?: string;
  forward_to?: string;
  accountSuffix?: string;
  [key: string]: unknown;
};

interface ForwardVerificationResponse {
  success?: boolean;
  payer?: string;
  payerAccount?: string;
  receiver?: string;
  receiverAccount?: string;
  amount?: number;
  date?: string;
  reference?: string;
  reason?: string;
  [key: string]: unknown;
}

const LEUL_BASE_URL = "https://verifyapi.leulzenebe.pro";
const TELEBIRR_RECEIPT_BASE_URL = "https://transactioninfo.ethiotelecom.et/receipt";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function findValueByLabel(html: string, labelFragment: string): string {
  const escaped = escapeRegExp(labelFragment);
  const pattern = new RegExp(
    `<td[^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
    "i"
  );
  const match = html.match(pattern);
  return match && match[1] ? stripTags(match[1]) : "";
}

function parseTelebirrDate(dateText: string): Date | null {
  const m = dateText.trim().match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, HH, MM, SS] = m;
  const d = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(HH),
    Number(MM),
    Number(SS)
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseTelebirrInvoiceDetailsRow(
  html: string,
  reference: string
): { paymentDateText: string; amountText: string } {
  const escapedRef = escapeRegExp(reference);
  const pattern = new RegExp(
    `<tr>\\s*<td[^>]*>\\s*${escapedRef}\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>\\s*<\\/tr>`,
    "i"
  );
  const match = html.match(pattern);
  if (!match) return { paymentDateText: "", amountText: "" };
  return {
    paymentDateText: stripTags(match[1] ?? ""),
    amountText: stripTags(match[2] ?? "")
  };
}

async function verifyTelebirrViaHtml(
  reference: string,
  initialPayload: InitialImagePayload | { data?: InitialImagePayload }
): Promise<VerificationResult> {
  const url = `${TELEBIRR_RECEIPT_BASE_URL}/${encodeURIComponent(reference)}`;
  const resp = await axios.get<string>(url, {
    responseType: "text",
    timeout: 15000
  });
  const html = resp.data || "";

  const payerName = findValueByLabel(html, "Payer Name");
  let creditedPartyName = findValueByLabel(html, "Credited Party name");
  if (creditedPartyName !== env.recipientName) {
    creditedPartyName = findValueByLabel(html, "Credited party account no");
    console.log("XXXX Credited party account no:", creditedPartyName);
    // creditedPartyName = creditedPartyName.replace(/^\d+\s+/, "");
    // console.log("XXXX Credited party name:", creditedPartyName);
    
  }
  const statusText = findValueByLabel(html, "transaction status");

  const invoiceRow = parseTelebirrInvoiceDetailsRow(html, reference);
  const paymentDateText = invoiceRow.paymentDateText;
  const totalAmountText =
    invoiceRow.amountText ||
    findValueByLabel(html, "Settled Amount") ||
    findValueByLabel(html, "Total Paid Amount");

  const numericAmount = totalAmountText.replace(/[^\d.,]/g, "").replace(/,/g, "").trim();
  const amount = numericAmount || "";

  const parsedDate = paymentDateText ? parseTelebirrDate(paymentDateText) : null;
  const date = parsedDate ?? new Date();
  const verified =
    Boolean(statusText) && statusText.toLowerCase().includes("completed") && Boolean(amount);

  return {
    verified,
    verificationType: "telebirr",
    reference,
    amount,
    payer: payerName,
    receiver: creditedPartyName,
    date,
    rawDetails: {
      initial: initialPayload,
      telebirrHtml: html,
      telebirrParsed: {
        payerName,
        creditedPartyName,
        paymentDateText,
        totalAmountText,
        statusText
      }
    }
  };
}

export async function verifyPaymentWithLeul(imagePath: string): Promise<VerificationResult> {
  if (!env.leulApiKey) {
    throw new Error("LEUL_API_KEY is not configured");
  }

  const formData = new FormData();
  formData.append("file", fs.createReadStream(imagePath));

  // 1) First call: /verify-image – parse reference + route info
  const initialResponse = await axios.post<InitialImagePayload | { data?: InitialImagePayload }>(
    `${LEUL_BASE_URL}/verify-image`,
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        "x-api-key": env.leulApiKey
      },
      timeout: 15000
    }
  );
  console.log("initialResponse", initialResponse);

  const raw = initialResponse.data as InitialImagePayload | { data?: InitialImagePayload };
  console.log("raw", raw);
  const initialData: InitialImagePayload =
    (raw as { data?: InitialImagePayload }).data ?? (raw as InitialImagePayload);

  const verificationType: "cbe" | "telebirr" =
    (initialData?.type as "cbe" | "telebirr" | undefined) || "cbe";
  const reference = initialData?.reference ?? "";
  const forwardTo = initialData?.forward_to;

  if (!reference) {
    throw new Error("Unable to determine reference from image");
  }

  if (verificationType === "telebirr") {
    return verifyTelebirrViaHtml(reference, initialResponse.data);
  }

  let accountSuffix: string | undefined =
    (initialData?.accountSuffix ?? env.cbeSuffix) || undefined;

  if (verificationType === "cbe") {
    if (accountSuffix === "required_from_user") {
      accountSuffix = env.cbeSuffix || undefined;
    }
  } else {
    if (accountSuffix === "required_from_user") {
      accountSuffix = undefined;
    }
  }
  if (!forwardTo || !reference) {
    throw new Error("Unable to determine verification endpoint or reference from image");
  }

  // 2) Second call: forward_to endpoint – verify payment details
  const verifyBody: Record<string, unknown> = { reference };
  if (accountSuffix) {
    verifyBody.accountSuffix = accountSuffix;
  }
  console.log("verifyBody", verifyBody);
  const verifyResponse = await axios.post<ForwardVerificationResponse>(
    `${LEUL_BASE_URL}${forwardTo}`,
    verifyBody,
    {
      headers: {
        "x-api-key": env.leulApiKey,
        "Content-Type": "application/json"
      },
      timeout: 15000
    }
  );

  const verifyData = verifyResponse.data;
  console.log("verifyData", verifyData);
  const result: VerificationResult = {
    verified: Boolean(verifyData.success),
    verificationType,
    reference: verifyData.reference ?? reference,
    amount: String(
      typeof verifyData.amount === "number" ? verifyData.amount : verifyData.amount ?? ""
    ),
    payer: verifyData.payer ?? "",
    receiver: verifyData.receiver ?? "",
    date: new Date(verifyData.date ?? Date.now()),
    rawDetails: {
      initial: initialResponse.data,
      verification: verifyData
    }
  };

  return result;
}

