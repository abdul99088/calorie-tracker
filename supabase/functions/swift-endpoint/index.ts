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
    const { prompt, messages, systemPrompt, model } = body

    if (!prompt && (!messages || messages.length === 0)) {
      return new Response(
        JSON.stringify({ error: "No prompt or messages provided." }),
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

    // Use model passed from frontend, fallback to scout (faster) then maverick
    const selectedModel = model || "meta-llama/llama-4-scout"

    // Build messages array
    const apiMessages = messages && messages.length > 0
      ? messages
      : [{ role: "user", content: prompt }]

    const requestBody: any = {
      model: selectedModel,
      messages: systemPrompt
        ? [{ role: "system", content: systemPrompt }, ...apiMessages]
        : apiMessages,
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://calorie-tracker.app",
        "X-Title": "Calorie Tracker",
      },
      body: JSON.stringify(requestBody),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("OpenRouter HTTP error:", response.status, JSON.stringify(data))
      return new Response(
        JSON.stringify({ error: data.error?.message || `API error ${response.status}`, status: response.status }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: response.status }
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

    const reply = data.choices[0]?.message?.content?.trim()
    if (!reply) {
      return new Response(
        JSON.stringify({ error: "Empty response from AI model." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err: any) {
    console.error("Edge function error:", err?.message || err)
    return new Response(
      JSON.stringify({ error: err?.message || "Internal Server Error" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
     