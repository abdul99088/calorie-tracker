import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { imageBase64 } = await req.json()

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

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://calorie-tracker.app",
        "X-Title": "Calorie Tracker"
      },
      body: JSON.stringify({
       model: "openrouter/free",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`
                }
              },
              {
                type: "text",
                text: `Analyze this food image. Return ONLY a single raw JSON object with no markdown, no backticks, no explanation. Use exactly this schema:
{
  "meal": "Name of the meal",
  "calories": 300,
  "protein": 20,
  "carbs": 30,
  "fat": 10
}`
              }
            ]
          }
        ]
      })
    })

    const data = await response.json()

    if (data.error) {
      console.error("OpenRouter Error:", data.error)
      return new Response(
        JSON.stringify({ error: data.error.message || JSON.stringify(data.error) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const rawText = data.choices[0].message.content.trim()
    const cleanText = rawText.replace(/```json|```/g, '').trim()

    return new Response(cleanText, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (err) {
    console.error("Edge function error:", err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
