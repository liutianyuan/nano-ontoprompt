from app.services.llm_service import (
    _build_extraction_messages,
    _estimate_tokens,
    _fit_extraction_max_tokens,
    split_text_for_extraction,
)


def test_build_extraction_messages_truncates_document_to_context_budget():
    model_config = {
        "options": {
            "max_context_tokens": 1200,
            "context_reserve_tokens": 50,
        }
    }
    prompt = "你是医疗本体抽取专家。" * 20
    text = "糖尿病患者出现多饮、多尿、体重下降，需要检查血糖和糖化血红蛋白。" * 500
    max_tokens = 200

    messages, truncated = _build_extraction_messages(
        text,
        prompt,
        model_config,
        "qwen-test",
        max_tokens,
    )

    total_tokens = (
        _estimate_tokens(messages[0]["content"])
        + _estimate_tokens(messages[1]["content"])
        + max_tokens
        + model_config["options"]["context_reserve_tokens"]
    )
    assert truncated is True
    assert "已按模型上下文限制截断" in messages[1]["content"]
    assert total_tokens <= model_config["options"]["max_context_tokens"]


def test_build_extraction_messages_honors_max_input_tokens_option():
    model_config = {
        "options": {
            "max_context_tokens": 8000,
            "context_reserve_tokens": 50,
            "max_input_tokens": 300,
        }
    }
    text = "高血压与头痛、头晕、心悸相关。" * 300

    messages, truncated = _build_extraction_messages(
        text,
        "返回医疗健康本体 JSON。",
        model_config,
        "qwen-test",
        200,
    )

    user_tokens = _estimate_tokens(messages[1]["content"])
    assert truncated is True
    assert user_tokens <= 360


def test_fit_extraction_max_tokens_never_exceeds_remaining_context():
    model_config = {
        "options": {
            "max_context_tokens": 1000,
            "context_reserve_tokens": 100,
        }
    }
    prompt = "你是医疗本体抽取专家。" * 350

    fitted = _fit_extraction_max_tokens(4096, prompt, model_config, "qwen-test")

    fixed_tokens = _estimate_tokens(prompt) + _estimate_tokens("请从以下文档中提取本体信息，以JSON格式返回：\n\n") + 100
    assert fitted <= 4096
    assert fixed_tokens + fitted <= model_config["options"]["max_context_tokens"] or fitted == 1


def test_split_text_for_extraction_chunks_long_documents_with_overlap():
    model_config = {
        "options": {
            "extraction_chunk_tokens": 500,
            "extraction_chunk_overlap_tokens": 80,
        }
    }
    text = "\n\n".join(f"第{i}段。糖尿病与血糖、饮食、运动、用药管理相关。" * 8 for i in range(80))

    chunks = split_text_for_extraction(text, model_config)

    assert len(chunks) > 1
    assert "".join(chunk[:20] for chunk in chunks)
    assert all(_estimate_tokens(chunk) <= 1020 for chunk in chunks)
