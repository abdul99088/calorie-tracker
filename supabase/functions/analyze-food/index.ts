import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { imageBase64, mimeType } = body

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image data provided." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const apiKey = Deno.env.get("OPENROUTER_API_KEY")
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENROUTER_API_KEY secret is not set in Supabase." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const imageMediaType = mimeType || 'image/jpeg'

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://calorie-tracker.app",
        "X-Title": "Calorie Tracker",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-maverick:free",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${imageMediaType};base64,${imageBase64}`,
                },
              },
              {
                type: "text",
                text: `Analyze this food image and estimate its nutritional content. Return ONLY a single raw JSON object with no markdown, no backticks, no explanation. Use exactly this schema:
{
  "meal": "Name of the meal",
  "calories": 300,
  "protein": 20,
  "carbs": 30,
  "fat": 10
}
All numeric values must be integers. "calories" is in kcal. "protein", "carbs", "fat" are in grams. Be accurate for South Asian / desi meals if applicable.`,
              },
            ],
          },
        ],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("OpenRouter HTTP error:", response.status, JSON.stringify(data))
      return new Response(
        JSON.stringify({ error: data.error?.message || `API error ${response.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (data.error) {
      console.error("OpenRouter API error:", JSON.stringify(data.error))
      return new Response(
        JSON.stringify({ error: data.error.message || JSON.stringify(data.error) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!data.choices || data.choices.length === 0) {
      return new Response(
        JSON.stringify({ error: "No response from AI model." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const rawText = data.choices[0]?.message?.content?.trim()
    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "Empty response from AI model." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Strip markdown fences if model added them anyway
    const cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

    // Validate it's parseable JSON before returning
    let parsed
    try {
      parsed = JSON.parse(cleanText)
    } catch {
      console.error("Model returned non-JSON:", cleanText)
      return new Response(
        JSON.stringify({ error: "AI returned an unexpected format. Try a clearer photo." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Validate required fields exist
    if (!parsed.meal || parsed.calories === undefined) {
      return new Response(
        JSON.stringify({ error: "AI could not identify the food. Try a clearer or closer photo." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (err: any) {
    console.error("Edge function error:", err?.message || err)
    return new Response(
      JSON.stringify({ error: err?.message || "Internal Server Error" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})