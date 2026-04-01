import { describe, expect, it, vi } from "vitest";

import { AzureApi } from "../apis/Azure.js";

function createAzureApi(apiType: "azure-openai" | "azure-foundry") {
  return new AzureApi({
    provider: "azure",
    apiKey: "test-api-key",
    apiBase:
      apiType === "azure-openai"
        ? "https://test-resource.openai.azure.com"
        : "https://test-resource.services.ai.azure.com",
    env:
      apiType === "azure-openai"
        ? {
            apiType,
            apiVersion: "2024-10-21",
            deployment: "gpt-5-deployment",
          }
        : {
            apiType,
            apiVersion: "2024-05-01-preview",
          },
  });
}

describe("AzureApi responses routing", () => {
  it("uses responses for Azure OpenAI gpt-5 non-stream", async () => {
    const api = createAzureApi("azure-openai");

    const responsesSpy = vi
      .spyOn(api as any, "responsesNonStream")
      .mockResolvedValue({
        id: "resp_1",
        object: "response",
        model: "gpt-5",
        created_at: 1710000001,
        output_text: "Hello from responses",
        error: null,
        incomplete_details: null,
        instructions: null,
        metadata: null,
        parallel_tool_calls: false,
        temperature: null,
        tool_choice: null,
        tools: [],
        usage: {
          input_tokens: 1,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 1,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 2,
        },
        output: [
          {
            id: "msg_1",
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Hello from responses" }],
          },
        ],
      } as any);

    const chatCompletionsSpy = vi.spyOn(api.openai.chat.completions, "create");

    const response = await api.chatCompletionNonStream(
      {
        model: "gpt-5",
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      },
      new AbortController().signal,
    );

    expect(responsesSpy).toHaveBeenCalledTimes(1);
    expect(chatCompletionsSpy).not.toHaveBeenCalled();
    expect(response.choices[0].message.content).toBe("Hello from responses");
  });

  it("uses chat/completions for Azure Foundry gpt-5-codex stream", async () => {
    const api = createAzureApi("azure-foundry");

    const responsesSpy = vi
      .spyOn(api as any, "responsesStream")
      .mockImplementation(async function* () {
        yield {
          id: "chatcmpl-1",
          object: "chat.completion.chunk",
          created: 1710000001,
          model: "gpt-5-codex",
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: "hello" },
              finish_reason: null,
            },
          ],
        } as any;
      });

    const chatCompletionsSpy = vi
      .spyOn(api.openai.chat.completions, "create")
      .mockResolvedValue(
        (async function* () {
          yield {
            id: "chatcmpl-1",
            object: "chat.completion.chunk",
            created: 1710000001,
            model: "gpt-5-codex",
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: "hello" },
                finish_reason: null,
              },
            ],
          };
        })() as any,
      );

    const chunks: any[] = [];
    for await (const chunk of api.chatCompletionStream(
      {
        model: "gpt-5-codex",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      },
      new AbortController().signal,
    )) {
      chunks.push(chunk);
    }

    expect(responsesSpy).not.toHaveBeenCalled();
    expect(chatCompletionsSpy).toHaveBeenCalledTimes(1);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].choices[0].delta.content).toBe("hello");
  });

  it("keeps chat/completions path for non-responses Azure models and filters empty chunks", async () => {
    const api = createAzureApi("azure-openai");

    const responsesSpy = vi.spyOn(api as any, "responsesStream");
    const chatCompletionsSpy = vi
      .spyOn(api.openai.chat.completions, "create")
      .mockResolvedValue(
        (async function* () {
          yield {
            id: "chatcmpl-1",
            object: "chat.completion.chunk",
            created: 1710000001,
            model: "gpt-4.1",
            choices: [],
          };
          yield {
            id: "chatcmpl-2",
            object: "chat.completion.chunk",
            created: 1710000002,
            model: "gpt-4.1",
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: "ok" },
                finish_reason: null,
              },
            ],
          };
        })() as any,
      );

    const chunks: any[] = [];
    for await (const chunk of api.chatCompletionStream(
      {
        model: "gpt-4.1",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      },
      new AbortController().signal,
    )) {
      chunks.push(chunk);
    }

    expect(responsesSpy).not.toHaveBeenCalled();
    expect(chatCompletionsSpy).toHaveBeenCalledTimes(1);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].choices[0].delta.content).toBe("ok");
  });
});
