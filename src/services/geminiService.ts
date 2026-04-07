import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export async function getChatResponse(message: string, history: { role: "user" | "model"; text: string }[]) {
  if (!ai) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: "Você é o assistente virtual do Smart Sampa da Mulher. Seu objetivo é apoiar mulheres em situação de risco, oferecer informações sobre segurança, empoderamento feminino e ajudar na busca de crianças desaparecidas. Seja empático, direto e útil. Se houver uma emergência real, oriente a usuária a usar o Botão de Emergência ou ligar para 190.",
    },
    history: history.map(h => ({
      role: h.role,
      parts: [{ text: h.text }]
    })),
  });

  const result = await chat.sendMessage({ message });
  return result.text;
}
