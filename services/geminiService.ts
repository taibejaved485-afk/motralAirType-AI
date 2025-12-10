import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const correctText = async (text: string): Promise<string> => {
  if (!apiKey) {
    console.warn("No API Key found for Gemini");
    return text; // Fallback
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Fix the grammar, spelling, and punctuation of the following text. Return ONLY the corrected text without any quotes or explanations. Text: "${text}"`,
    });
    
    return response.text?.trim() || text;
  } catch (error) {
    console.error("Gemini correction failed:", error);
    return text;
  }
};

export const autocompleteText = async (text: string): Promise<string> => {
    if (!apiKey) return "";
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Complete the following sentence naturally. Return only the completion part. Text so far: "${text}"`,
            config: {
                maxOutputTokens: 20,
            }
        });
        return response.text?.trim() || "";
    } catch (error) {
        console.error("Gemini autocomplete failed:", error);
        return "";
    }
}
