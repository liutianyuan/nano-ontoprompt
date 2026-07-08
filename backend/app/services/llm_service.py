import json
import math
import re
from typing import Any, Optional
from app.config import settings


class LLMRequestError(RuntimeError):
    pass


def _positive_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _llm_timeout(model_config: dict) -> int:
    options = model_config.get("options") or {}
    timeout = _positive_int(
        options.get("timeout") or model_config.get("timeout"),
        settings.llm_timeout_seconds,
    )
    return min(timeout, settings.llm_max_timeout_seconds)


def _llm_max_tokens(model_config: dict) -> int:
    options = model_config.get("options") or {}
    max_tokens = _positive_int(
        options.get("max_tokens") or model_config.get("max_tokens"),
        settings.llm_max_tokens,
    )
    return min(max_tokens, settings.llm_max_tokens)


def _llm_context_window(model_config: dict, model_name: str) -> int:
    options = model_config.get("options") or {}
    configured = (
        options.get("max_context_tokens")
        or options.get("context_window")
        or options.get("context_window_tokens")
        or model_config.get("max_context_tokens")
        or model_config.get("context_window")
    )
    default = settings.llm_context_window_tokens
    lowered = (model_name or "").lower()
    if "qwen3.6" in lowered or "200k" in lowered:
        default = 200000
    return _positive_int(configured, default)


def _llm_context_reserve(model_config: dict) -> int:
    options = model_config.get("options") or {}
    return _positive_int(
        options.get("context_reserve_tokens") or model_config.get("context_reserve_tokens"),
        settings.llm_context_reserve_tokens,
    )


def _llm_max_input_tokens(model_config: dict) -> Optional[int]:
    options = model_config.get("options") or {}
    configured = options.get("max_input_tokens") or model_config.get("max_input_tokens")
    if configured is None:
        return None
    return _positive_int(configured, 0) or None


def _llm_extraction_chunk_tokens(model_config: dict) -> int:
    options = model_config.get("options") or {}
    return _positive_int(
        options.get("extraction_chunk_tokens") or model_config.get("extraction_chunk_tokens"),
        settings.llm_extraction_chunk_tokens,
    )


def _llm_extraction_chunk_overlap_tokens(model_config: dict) -> int:
    options = model_config.get("options") or {}
    return _positive_int(
        options.get("extraction_chunk_overlap_tokens") or model_config.get("extraction_chunk_overlap_tokens"),
        settings.llm_extraction_chunk_overlap_tokens,
    )


def _estimate_tokens(text: str) -> int:
    if not text:
        return 0
    ascii_chars = sum(1 for ch in text if ord(ch) < 128)
    non_ascii_chars = len(text) - ascii_chars
    return max(1, math.ceil(ascii_chars / 3) + math.ceil(non_ascii_chars * 1.1))


def _truncate_text_to_token_budget(text: str, token_budget: int) -> tuple[str, bool]:
    if _estimate_tokens(text) <= token_budget:
        return text, False
    if token_budget <= 0:
        return "", True

    low, high = 0, len(text)
    while low < high:
        mid = (low + high + 1) // 2
        if _estimate_tokens(text[:mid]) <= token_budget:
            low = mid
        else:
            high = mid - 1
    return text[:low].rstrip(), True


def _find_chunk_boundary(text: str, start: int, end: int) -> int:
    if end >= len(text):
        return len(text)
    window_start = max(start + 1, end - 2000)
    candidates = [
        text.rfind(mark, window_start, end)
        for mark in ("\n\n", "\n#", "\n---", "。", "；", "\n")
    ]
    boundary = max(candidates)
    return boundary + 1 if boundary > start else end


def split_text_for_extraction(
    text: str,
    model_config: dict,
    prompt_content: str = "",
    model_name: str = "",
) -> list[str]:
    chunk_budget = _llm_extraction_chunk_tokens(model_config)
    if prompt_content:
        user_prefix = "请从以下文档中提取本体信息，以JSON格式返回：\n\n"
        max_tokens = _fit_extraction_max_tokens(_llm_max_tokens(model_config), prompt_content, model_config, model_name)
        available = (
            _llm_context_window(model_config, model_name)
            - _estimate_tokens(prompt_content)
            - _estimate_tokens(user_prefix)
            - max_tokens
            - _llm_context_reserve(model_config)
        )
        chunk_budget = min(chunk_budget, max(1, available))
    max_input_tokens = _llm_max_input_tokens(model_config)
    if max_input_tokens is not None:
        chunk_budget = min(chunk_budget, max_input_tokens)
    chunk_budget = max(1000, chunk_budget)

    if _estimate_tokens(text) <= chunk_budget:
        return [text]

    overlap_budget = min(_llm_extraction_chunk_overlap_tokens(model_config), chunk_budget // 4)
    chunks: list[str] = []
    pos = 0
    text_len = len(text)
    while pos < text_len:
        low, high = pos + 1, text_len
        best = pos + 1
        while low <= high:
            mid = (low + high) // 2
            if _estimate_tokens(text[pos:mid]) <= chunk_budget:
                best = mid
                low = mid + 1
            else:
                high = mid - 1

        end = _find_chunk_boundary(text, pos, best)
        chunk = text[pos:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= text_len:
            break

        overlap_start = end
        if overlap_budget > 0:
            low, high = pos, end
            overlap_start = end
            while low <= high:
                mid = (low + high) // 2
                if _estimate_tokens(text[mid:end]) <= overlap_budget:
                    overlap_start = mid
                    high = mid - 1
                else:
                    low = mid + 1
        pos = max(overlap_start, pos + 1)

    return chunks or [text]


def _build_extraction_messages(
    text: str,
    prompt_content: str,
    model_config: dict,
    model_name: str,
    max_tokens: int,
) -> tuple[list, bool]:
    user_prefix = "请从以下文档中提取本体信息，以JSON格式返回：\n\n"
    truncation_notice = "\n\n[系统提示：原始文档过长，已按模型上下文限制截断；请仅基于可见内容提取。]\n\n"
    context_window = _llm_context_window(model_config, model_name)
    reserve_tokens = _llm_context_reserve(model_config)
    fixed_tokens = _estimate_tokens(prompt_content) + _estimate_tokens(user_prefix) + max_tokens + reserve_tokens
    text_budget = context_window - fixed_tokens
    max_input_tokens = _llm_max_input_tokens(model_config)
    if max_input_tokens is not None:
        text_budget = min(text_budget, max_input_tokens)

    clipped_text, truncated = _truncate_text_to_token_budget(text, text_budget)
    if truncated and clipped_text:
        notice_tokens = _estimate_tokens(truncation_notice)
        clipped_text, _ = _truncate_text_to_token_budget(clipped_text, max(0, text_budget - notice_tokens))
        user_content = f"{user_prefix}{clipped_text}{truncation_notice}"
    else:
        user_content = f"{user_prefix}{clipped_text}"

    return [
        {"role": "system", "content": prompt_content},
        {"role": "user", "content": user_content},
    ], truncated


def _fit_extraction_max_tokens(
    requested_max_tokens: int,
    prompt_content: str,
    model_config: dict,
    model_name: str,
) -> int:
    user_prefix = "请从以下文档中提取本体信息，以JSON格式返回：\n\n"
    context_window = _llm_context_window(model_config, model_name)
    reserve_tokens = _llm_context_reserve(model_config)
    fixed_input_tokens = _estimate_tokens(prompt_content) + _estimate_tokens(user_prefix) + reserve_tokens
    available = context_window - fixed_input_tokens
    if available <= 0:
        return 1
    return max(1, min(requested_max_tokens, available))


def _json_mode_enabled(provider: str, model_config: dict) -> bool:
    options = model_config.get("options") or {}
    if "json_mode" in options:
        return bool(options.get("json_mode"))
    if "response_format" in options:
        return bool(options.get("response_format"))
    return provider == "openai" and not model_config.get("api_base")


def extract_ontology(text: str, prompt_content: str, model_config: dict, model_name: str, retry_count: Optional[int] = None) -> dict:
    provider = model_config.get("provider", "openai")
    api_key = model_config.get("api_key", "")
    api_base = model_config.get("api_base")
    timeout = _llm_timeout(model_config)
    max_tokens = _fit_extraction_max_tokens(_llm_max_tokens(model_config), prompt_content, model_config, model_name)
    json_mode = _json_mode_enabled(provider, model_config)
    attempts = retry_count if retry_count is not None else settings.llm_retry_count
    attempts = max(1, attempts)
    messages, _ = _build_extraction_messages(text, prompt_content, model_config, model_name, max_tokens)

    last_error: Optional[Exception] = None
    for attempt in range(attempts):
        try:
            raw = _call_llm(provider, api_key, api_base, model_name, messages, json_mode=json_mode, timeout=timeout, max_tokens=max_tokens)
            return _parse_response(raw)
        except Exception as e:
            last_error = e
            if attempt == attempts - 1:
                base = api_base or "default"
                raise LLMRequestError(f"模型服务请求失败：model={model_name}, base={base}, timeout={timeout}s, error={e}") from e
    raise RuntimeError(f"LLM extraction failed: {last_error}")


def test_llm_chat(model_config: dict, model_name: str, timeout: Optional[int] = None) -> str:
    provider = model_config.get("provider", "openai")
    api_key = model_config.get("api_key", "")
    api_base = model_config.get("api_base")
    timeout = timeout or _llm_timeout(model_config)
    return _call_llm(
        provider,
        api_key,
        api_base,
        model_name,
        [{"role": "system", "content": "Return JSON only."}, {"role": "user", "content": "{\"ok\": true}"}],
        json_mode=False,
        timeout=timeout,
        max_tokens=32,
    )


def infer_relations(entities: list, existing_relations: list, text: str,
                    model_config: dict, model_name: str) -> list:
    """Second-pass relation inference: find IS-A / PART-OF / INSTANCE-OF links the first pass missed."""
    if len(entities) < 3:
        return []

    provider  = model_config.get("provider", "openai")
    api_key   = model_config.get("api_key", "")
    api_base  = model_config.get("api_base")
    timeout   = _llm_timeout(model_config)
    max_tokens = min(_llm_max_tokens(model_config), 2048)
    json_mode = _json_mode_enabled(provider, model_config)

    # Build entity snapshot (limit to 50 to keep prompt manageable)
    entity_lines = "\n".join(
        f"- {e.get('name_cn','?')} ({e.get('type','?')}): {(e.get('description') or '')[:60]}"
        for e in entities[:50]
    )
    existing_set = {
        (r.get("source"), r.get("type"), r.get("target"))
        for r in existing_relations
        if r.get("source") and r.get("target")
    }

    system_prompt = (
        "你是本体关系补全专家。给定已提取实体列表和原始文档，找出实体间遗漏的层级和关联关系。\n\n"
        "关系类型（只能使用以下类型）：IS-A、PART-OF、INSTANCE-OF、supply、stores、processes、treats、causes、关联\n\n"
        "重点寻找：\n"
        "1. IS-A：A 是 B 的一种（如 销售费用 IS-A 费用）\n"
        "2. PART-OF：A 是 B 的组成部分（如 流动资产 PART-OF 资产）\n"
        "3. INSTANCE-OF：A 是 B 的具体实例（如 华为供应链 INSTANCE-OF S级战略客户）\n\n"
        "要求：\n"
        "- 只输出新发现的关系，不要重复已有关系\n"
        "- source 和 target 必须是实体列表中的 name_cn\n"
        "- 每对实体最多一条关系\n"
        "- 至少找 10 条，最多 30 条\n\n"
        '返回 JSON（不要有其他文字）：{"relations": [{"source": "A", "target": "B", "type": "IS-A", "confidence": 0.85}]}'
    )
    user_msg = (
        f"已提取实体：\n{entity_lines}\n\n"
        f"文档节选：\n{text[:2500]}"
    )

    try:
        raw = _call_llm(provider, api_key, api_base, model_name,
                        [{"role": "system", "content": system_prompt},
                         {"role": "user", "content": user_msg}],
                        json_mode=json_mode,
                        timeout=timeout,
                        max_tokens=max_tokens)
        parsed = _parse_response(raw)
        candidates = parsed.get("relations", []) if isinstance(parsed, dict) else (parsed if isinstance(parsed, list) else [])

        new_rels = []
        for r in candidates:
            if not isinstance(r, dict):
                continue
            key = (r.get("source"), r.get("type"), r.get("target"))
            if key[0] and key[2] and key not in existing_set:
                new_rels.append(r)
                existing_set.add(key)
        return new_rels
    except Exception:
        return []  # relation inference failure is non-fatal


def _call_llm(provider: str, api_key: str, api_base: Optional[str], model: str, messages: list, json_mode: bool = True, timeout: Optional[int] = None, max_tokens: Optional[int] = None) -> str:
    timeout = timeout or settings.llm_timeout_seconds
    max_tokens = max_tokens or settings.llm_max_tokens
    if provider == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=api_key, timeout=timeout, max_retries=0)
        resp = client.messages.create(
            model=model, max_tokens=max_tokens,
            system=messages[0]["content"],
            messages=[{"role": "user", "content": messages[1]["content"] + ("\n\n```json\n{" if json_mode else "")}],
        )
        return ("{" + resp.content[0].text) if json_mode else resp.content[0].text
    else:
        import openai
        kwargs = {"api_key": api_key}
        if api_base:
            kwargs["base_url"] = api_base
        client = openai.OpenAI(**kwargs, timeout=timeout, max_retries=0)
        create_kwargs: dict = {"model": model, "messages": messages, "max_tokens": max_tokens}
        if json_mode:
            create_kwargs["response_format"] = {"type": "json_object"}
        resp = client.chat.completions.create(**create_kwargs)
        return resp.choices[0].message.content or ""


def _parse_response(raw: str) -> dict:
    if not raw:
        raise ValueError("Empty LLM response")

    # Strip markdown code fences (```json ... ``` or ``` ... ```)
    text = raw.strip()
    text = re.sub(r'^```(?:json)?\s*\n?', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\n?```\s*$', '', text).strip()

    # Remove control characters that are illegal inside JSON strings
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)

    # Fast path: well-formed JSON
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try json_repair (handles unescaped quotes, truncated output, etc.)
    try:
        from json_repair import repair_json
        repaired = repair_json(text)
        result = json.loads(repaired)
        if isinstance(result, dict):
            return result
    except Exception:
        pass

    # Last resort: slice from first { to last } and try again
    start, end = text.find('{'), text.rfind('}')
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Cannot parse LLM response as JSON: {raw[:300]}")
