/**
 * AI Models Configuration
 * Contains information about available AI providers, models, and endpoint details
 */

const AI_MODELS = {
    // OpenAI Models
    openai: {
        displayName: "OpenAI",
        models: [
            { id: "gpt-4.5-preview", name: "GPT-4.5 Preview", maxTokens: 4096, streaming: true },
            { id: "gpt-4.1", name: "GPT-4.1", maxTokens: 4096, streaming: true },
            { id: "gpt-4o", name: "GPT-4o", maxTokens: 4096, streaming: true },
            { id: "o3-mini-high", name: "O3-Mini-High", maxTokens: 2048, streaming: true },
            { id: "o4-mini", name: "O4-Mini", maxTokens: 2048, streaming: true }
        ],
        apiEndpoint: "https://api.openai.com/v1/chat/completions",
        authMethod: "Bearer",
        requestFormat: function(boardState, moveHistory, config) {
            return {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        {
                            role: "system",
                            content: "You are a chess engine. Your task is to analyze the current board position and make the best move possible. Respond ONLY with your chosen move in standard algebraic notation. Valid examples: 'e4', 'Nf3', 'cxd4', 'O-O', 'Qxb7+', etc. Be extremely careful to verify that your move is legal in the current position. For complex positions, consider checks, pins, and material threats carefully. For captures, explicitly use notation like 'cxd4' instead of just 'd4'."
                        },
                        {
                            role: "user",
                            content: config.userPrompt || `Current board state (FEN): ${boardState.fen()}\n\nMove history: ${moveHistory.join(", ")}\n\nProvide your next move in standard algebraic notation (e.g., 'e4', 'Nf3').`
                        }
                    ],
                    ...(config.model.startsWith('o4-') || config.model.startsWith('o3-') 
                        ? { max_completion_tokens: config.maxTokens } // For newer models like o4-mini
                        : { temperature: config.temperature, max_tokens: config.maxTokens }), // For older models
                    stream: config.streaming
                })
            };
        },
        parseResponse: async function(response, config) {
            if (config.streaming) {
                const reader = response.body.getReader();
                let partialResponse = "";
                let moveData = { move: "", thinking: "" };
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break; // Exit loop when stream is finished
                    
                    // Decode the chunk
                    const chunk = new TextDecoder().decode(value);
                    partialResponse += chunk;
                    
                    // Process lines from "data: " prefixed SSE format
                    const lines = partialResponse.split('\n');
                    partialResponse = lines.pop() || '';  // Keep the last partial line for next iteration
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.substring(6);
                            if (data === '[DONE]') continue;
                            
                            try {
                                const parsedData = JSON.parse(data);
                                const content = parsedData.choices[0]?.delta?.content || '';
                                if (content) {
                                    moveData.thinking += content; // Accumulate thinking text
                                }
                            } catch (e) {
                                console.error("Error parsing streaming response chunk:", e, "Data:", data);
                            }
                        }
                    }
                    
                    // Update the thinking content in real-time (optional, but good UX)
                    // This part assumes you have an element with id 'thinking-content'
                    // If not, you might need to adjust or remove this UI update.
                    if (typeof updateThinkingCallback === 'function') { 
                        updateThinkingCallback(moveData.thinking);
                    }
                }
                
                // Stream finished, now extract the move from the complete thinking text
                const finalThinking = moveData.thinking.trim();
                const moveMatch = finalThinking.match(/\b([a-h][1-8]|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|O-O(?:-O)?)\b/);
                const cleanedMove = moveMatch ? moveMatch[0] : ''; // Extract the first valid move found
                
                console.log(`[AI Parse] Full thinking: "${finalThinking}", Extracted move: "${cleanedMove}"`);
                
                return {
                    move: cleanedMove,
                    thinking: finalThinking
                };
            } else {
                const data = await response.json();
                const content = data.choices[0]?.message?.content || '';
                
                // Extract the move from the content using improved regex for all move types
                // This now properly handles pawn captures like 'cxd4'
                let moveMatch = content.match(/\b([a-h][1-8]|[a-h]x[a-h][1-8]|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|O-O(?:-O)?)\b/);
                
                // If no move found from standard regex but thinking has 'cxd4' pattern, extract it
                let move = moveMatch ? moveMatch[0] : '';
                console.log(`[AI Parse] Full thinking: "${content}", Extracted move: "${move}"`);
                
                // If thinking IS the move (e.g., content is just "cxd4"), use it directly
                if (!move && content.trim().length > 0 && content.trim().length < 6) {
                    move = content.trim();
                }
                
                return {
                    move: move,
                    thinking: content
                };
            }
        }
    },
    
    // xAI Models - Uses the dedicated Grok module for improved reliability
    xai: {
        displayName: "xAI",
        models: [
            { id: "grok-3-latest", name: "Grok-3 Latest", maxTokens: 4096, streaming: true },
            { id: "grok-3-mini-beta", name: "Grok-3 Mini Beta", maxTokens: 2048, streaming: true }
        ],
        apiEndpoint: "https://api.x.ai/v1/chat/completions",  // Updated correct endpoint
        authMethod: "Bearer",
        requestFormat: function(boardState, moveHistory, config) {
            // Enhanced system prompt with more detailed instructions for Grok models
            const systemPrompt = "You are a chess engine analyzing a position to make the best legal move. Your ONLY task is to choose and return a single valid move in standard algebraic notation (SAN). DO NOT explain your reasoning or provide any commentary. DO NOT return the string 'e4' unless the e-pawn can legally move to e4. Valid examples: 'e4', 'Nf3', 'cxd4', 'O-O', 'Qxb7+'. For captures, explicitly use notation like 'cxd4'. Only return a legal move!";
            
            // Create a more structured user prompt that helps Grok understand the position
            let userPrompt;
            if (config.customPrompt) {
                // Use the custom prompt from retry attempts which includes legal moves
                userPrompt = config.customPrompt;
            } else {
                // Standard prompt with sufficient context
                userPrompt = `Current board state: ${boardState.fen()}\n\nMove history: ${moveHistory.join(", ")}\n\nProvide your NEXT MOVE ONLY in standard algebraic notation.`;
            }
            
            // Prepare formatted messages
            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ];
            
            // For retry attempts, limit tokens to speed up the response
            if (config.retryCount > 0) {
                // Keep the same messages but set a much smaller max_tokens value
                // for retry attempts since we just need a valid move
                cleanOptions.max_tokens = Math.min(cleanOptions.max_tokens || 2048, 1024);
            }
            
            // Example for reasoning models only on the first attempt to save tokens
            if (config.model === 'grok-3-mini-beta' && !config.retryCount) {
                messages.splice(1, 0, {
                    role: "assistant",
                    content: "e4", // Example response - just the move
                    reasoning_content: "Looking at this position, I have several options." // Shorter reasoning
                });
                
                // No need to duplicate the prompt - that was causing slowness
            }
            
            // Return both the formatted API request and the messages for the Grok module
            return {
                messages: messages,
                options: {
                    temperature: config.temperature || 0.7, // Default temperature if not provided
                    max_tokens: config.retryCount > 0 ? 1024 : (config.maxTokens || 2048), // Lower tokens on retry
                    // Use medium reasoning effort for faster response
                    ...(config.model === 'grok-3-mini-beta' && { 
                        reasoning_effort: config.retryCount > 0 ? 'medium' : 'high' 
                    })
                },
                streaming: config.streaming
            };
        },
        parseResponse: async function(response, config) {
            // For streaming responses, the Grok module already handles this
            if (config.streaming) {
                // Extract the response data passed from the Grok module
                // Check if response is an error
                if (response instanceof Error) {
                    throw response; // Re-throw the error to be handled by the game
                }
                const moveData = response; // This is now directly the data from streamGrokResponse
                
                // The content should already be cleaned by the Grok module's extractValidChessMove function
                let content = moveData.response || '';
                let reasoning = moveData.reasoning || '';
                
                // Generate thinking text that includes both response and reasoning if available
                let thinking = content;
                if (reasoning) {
                    thinking += '\n\nReasoning: ' + reasoning;
                }
                
                return {
                    move: content,
                    thinking: thinking
                };
            } else {
                // For non-streaming, response is already the parsed data from sendGrokRequest
                const moveData = response;
                
                // Get legal moves if provided in config
                const legalMoves = config.legalMoves || null;
                
                // The content should already be cleaned by the Grok module's extractValidChessMove function
                let content = moveData.response || '';
                let reasoning = moveData.reasoning || '';
                
                // Generate thinking text that includes both response and reasoning if available
                let thinking = content;
                if (reasoning) {
                    thinking = `${content}\n\nReasoning: ${reasoning}`;
                }
                
                // Use the reasoning if the main response is empty or very short
                if (!content.trim() && reasoning.trim()) {
                    content = reasoning.trim();
                }
                
                // Use the Grok module's extractValidChessMove function with legal moves
                // This will filter the move against legal moves if provided
                let move = window.GrokModels.extractValidChessMove(content, reasoning, legalMoves);
                
                // Handle edge case: response is too long to be just a move and extraction failed
                if (!move && content.length > 10) {
                    // Try to extract with more specialized chess notation regex
                    const movePatterns = [
                        /\b([KQRBN][a-h][1-8][\+#]?)\b/,  // Piece moves with rank and file
                        /\b([KQRBN]x[a-h][1-8][\+#]?)\b/, // Captures with piece
                        /\b([a-h]x[a-h][1-8][\+#]?)\b/,   // Pawn captures
                        /\b([a-h][1-8][\+#]?)\b/,          // Pawn moves
                        /\bO-O(-O)?[\+#]?\b/               // Castling
                    ];
                    
                    // Collect all potential moves
                    const potentialMoves = [];
                    for (const pattern of movePatterns) {
                        const matches = content.match(new RegExp(pattern, 'g')) || [];
                        potentialMoves.push(...matches);
                    }
                    
                    // If we have legal moves, filter potential moves
                    if (legalMoves && legalMoves.length > 0 && potentialMoves.length > 0) {
                        const legalPotentialMoves = potentialMoves.filter(m => 
                            legalMoves.includes(m) || 
                            legalMoves.some(lm => lm.toLowerCase() === m.toLowerCase())
                        );
                        
                        if (legalPotentialMoves.length > 0) {
                            move = legalPotentialMoves[0];
                        }
                    } else if (potentialMoves.length > 0) {
                        move = potentialMoves[0];
                    }
                }
                
                console.log(`[Grok] Response: "${content}", Extracted move: "${move}", Has reasoning: ${reasoning ? 'Yes' : 'No'}, Legal moves: ${legalMoves ? JSON.stringify(legalMoves) : 'None'}`);
                
                // If move is still empty, check if there's a move-like pattern in the thinking
                if (!move && thinking) {
                    const moveMatches = thinking.match(/\b([a-h][1-8]|[a-h]x[a-h][1-8]|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|O-O(?:-O)?)\b/g) || [];
                    
                    if (moveMatches.length > 0) {
                        // If we have legal moves, filter the matches
                        if (legalMoves && legalMoves.length > 0) {
                            const legalMatches = moveMatches.filter(m => 
                                legalMoves.includes(m) || 
                                legalMoves.some(lm => lm.toLowerCase() === m.toLowerCase())
                            );
                            
                            if (legalMatches.length > 0) {
                                move = legalMatches[0];
                                console.log(`[Grok] Found legal move in thinking: "${move}"`);
                            }
                        } else {
                            move = moveMatches[0];
                            console.log(`[Grok] Extracted from thinking: "${move}"`);
                        }
                    }
                }
                
                return {
                    move: move,
                    thinking: thinking
                };
            }
        }
    },
    
    // Google Gemini Models
    gemini: {
        displayName: "Google Gemini",
        models: [
            { id: "gemini-2.5-pro-exp-03-25", name: "Gemini 2.5 Pro Exp", maxTokens: 4096, streaming: true },
            { id: "gemini-2.5-flash-preview-04-17", name: "Gemini 2.5 Flash Preview", maxTokens: 2048, streaming: true },
            { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash Exp", maxTokens: 2048, streaming: true }
        ],
        apiEndpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        authMethod: "APIKey",
        requestFormat: function(boardState, moveHistory, config) {
            // Gemini uses a different endpoint format with model ID in the URL
            const endpoint = this.apiEndpoint.replace("{model}", config.model);
            return {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [
                        {
                            role: "system",
                            parts: [
                                {
                                    text: "You are a chess engine. Your task is to analyze the current board position and make the best move possible. Respond ONLY with your chosen move in standard algebraic notation (e.g., 'e4', 'Nf3', etc.)."
                                }
                            ]
                        },
                        {
                            role: "user",
                            parts: [
                                {
                                    text: `Current board state (FEN): ${boardState.fen()}\n\nMove history: ${moveHistory.join(", ")}\n\nProvide your next move in standard algebraic notation (e.g., 'e4', 'Nf3').`
                                }
                            ]
                        }
                    ],
                    generationConfig: {
                        temperature: config.temperature,
                        maxOutputTokens: config.maxTokens
                    },
                    safetySettings: [
                        {
                            category: "HARM_CATEGORY_HARASSMENT",
                            threshold: "BLOCK_NONE"
                        },
                        {
                            category: "HARM_CATEGORY_HATE_SPEECH",
                            threshold: "BLOCK_NONE"
                        },
                        {
                            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                            threshold: "BLOCK_NONE"
                        },
                        {
                            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                            threshold: "BLOCK_NONE"
                        }
                    ]
                }),
                url: `${endpoint}?key=${config.apiKey}` // Gemini uses query param for API key
            };
        },
        parseResponse: async function(response, config) {
            const data = await response.json();
            
            // Gemini has a different response structure
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            // Try to extract the move from the content
            const moveMatch = content.match(/\b([a-h][1-8]|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|O-O(?:-O)?)\b/);
            const move = moveMatch ? moveMatch[0] : '';
            
            return {
                move: move,
                thinking: content
            };
        }
    }
};

/**
 * Get models for a specific provider
 * @param {string} provider - The provider ID (openai, xai, gemini)
 * @returns {Array} Array of model objects for the provider
 */
function getModelsForProvider(provider) {
    return AI_MODELS[provider] ? AI_MODELS[provider].models : [];
}

/**
 * Get provider details
 * @param {string} provider - The provider ID
 * @returns {Object} Provider details
 */
function getProviderDetails(provider) {
    return AI_MODELS[provider] || null;
}

/**
 * Make API call to the AI model
 * @param {string} provider - Provider ID (openai, xai, gemini)
 * @param {Object} boardState - Chess.js board state
 * @param {Array} moveHistory - Array of previous moves
 * @param {Object} config - Configuration (apiKey, model, temperature, etc.)
 * @returns {Promise} Promise resolving to the move response
 */
async function callAIModel(provider, boardState, moveHistory, config) {
    const providerData = AI_MODELS[provider];
    
    if (!providerData) {
        throw new Error(`Unknown provider: ${provider}`);
    }
    
    // Check if this is an O-series model (o3-mini, o4-mini) from OpenAI
    // These models use a different API structure and need special handling
    if (provider === 'openai' && window.OModels && window.OModels.isOSeriesModel(config.model)) {
        console.log(`[API Route] Using O-series handler for model: ${config.model}`);
        return await window.OModels.callOModel(boardState, moveHistory, config);
    }
    
    // Format the request based on provider specifications
    // Pass the custom prompt if available for invalid move recovery
    const requestData = providerData.requestFormat(boardState, moveHistory, {
        ...config,
        // Pass the custom prompt if available (set by handleInvalidMove)
        customPrompt: config.customPrompt
    });
    
    try {
        // Special handling for xAI/Grok models using our dedicated module
        if (provider === 'xai') {
            console.log(`[xAI] Using Grok module for model: ${config.model}`);
            
            try {
                // Extract the necessary parameters from the requestData
                const { messages, options, streaming } = requestData;
                
                // Add debug logs to help troubleshoot
                if (config.customPrompt) {
                    console.log(`[xAI] Using enhanced prompt (retry ${config.retryCount || 0})`);
                }
                
                // Use streaming or non-streaming Grok API based on configuration
                if (streaming) {
                    // For streaming, we need a callback to update the thinking content
                    let accumulatedContent = '';
                    let accumulatedReasoning = '';
                    
                    // The callback function that will be called with each content update
                    const onUpdate = (updateData) => {
                        if (updateData.content) {
                            accumulatedContent = updateData.content;
                            // Update the thinking display
                            const thinkingElement = document.getElementById('thinking-content');
                            if (thinkingElement) {
                                let displayContent = accumulatedContent;
                                
                                // If we have reasoning, show that too
                                if (updateData.reasoning) {
                                    accumulatedReasoning = updateData.reasoning;
                                    displayContent += "\n\nReasoning: " + accumulatedReasoning;
                                }
                                
                                thinkingElement.textContent = displayContent;
                            }
                        }
                    };
                    
                    // Call the streaming Grok API with enhanced options
                    const enhancedOptions = {
                        ...options,
                        top_p: 0.9,  // Add top_p parameter for better diversity
                        frequency_penalty: 0.2,  // Reduce repetition
                        presence_penalty: 0.2    // Encourage diverse responses
                    };
                    
                    const grokResponse = await window.GrokModels.streamGrokResponse(
                        config.apiKey,
                        config.model,
                        messages,
                        onUpdate,
                        enhancedOptions
                    );
                    
                    // Pass the grokResponse to the parseResponse method
                    return await providerData.parseResponse(grokResponse, config);
                } else {
                    // For non-streaming, use the standard sendGrokRequest function
                    // Simpler parameters for faster execution
                    const enhancedOptions = {
                        ...options,
                        // Remove parameters that might cause latency
                        max_tokens: config.retryCount > 0 ? 1024 : (options.max_tokens || 2048)
                    };
                    
                    // Log if we're on a retry attempt
                    if (config.retryCount) {
                        console.log(`[xAI] Retry attempt ${config.retryCount} with temperature ${enhancedOptions.temperature}`);
                        // Add the retry count to the options so the Grok module can use it
                        enhancedOptions.retryCount = config.retryCount;
                    }
                    
                    const grokResponse = await window.GrokModels.sendGrokRequest(
                        config.apiKey,
                        config.model,
                        messages,
                        enhancedOptions,
                        false // explicitly set streaming to false
                    );
                    
                    // Pass the grokResponse to the parseResponse method
                    return await providerData.parseResponse(grokResponse, config);
                }
            } catch (error) {
                console.error("[xAI] Error in Grok API call:", error);
                
                // Provide better error handling with specific error types
                if (error.message.includes('API authentication failed') || 
                    error.message.includes('认证失败')) {
                    throw new Error(`API authentication failed: Please check your X.AI API key.`);
                } else if (error.message.includes('rate limit')) {
                    throw new Error(`Rate limit exceeded: X.AI API rate limit reached. Please try again later.`);
                }
                
                // Re-throw original error if not handled above
                throw error;
            }
        }
        
        // For non-xAI providers, use the standard fetch approach
        const response = await fetch(requestData.url || providerData.apiEndpoint, {
            method: requestData.method,
            headers: requestData.headers,
            body: requestData.body
        });
        
        // Check for HTTP errors first
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 401) {
                // Special handling for authentication errors
                const errorMsg = errorData.msg || errorData.error?.message || 'Invalid API key';
                throw new Error(`API authentication failed: ${errorMsg}`);
            }
            throw new Error(`API error ${response.status}: ${errorData.msg || errorData.error?.message || response.statusText}`);
        }
        
        // Parse the response using provider-specific method
        return await providerData.parseResponse(response, config);
        
    } catch (error) {
        console.error("Error calling AI model:", error);
        // Additional logging for xAI errors to help debugging
        if (provider === 'xai') {
            console.error("Detailed xAI error:", error.message);
        }
        throw error;
    }
}
