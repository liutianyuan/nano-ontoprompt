from app.tasks.extraction import _merge_ontology_results


def test_merge_ontology_results_deduplicates_entities_and_relations():
    base = {
        "entities": [
            {
                "name_cn": "糖尿病",
                "name_en": "Diabetes",
                "type": "Disease",
                "description": "慢性代谢性疾病",
                "properties": {"病程": "慢性"},
                "confidence": 0.82,
            }
        ],
        "relations": [],
        "logic_rules": [],
        "actions": [],
    }
    incoming = {
        "entities": [
            {
                "name_cn": "糖尿病",
                "type": "Disease",
                "description": "与血糖升高相关",
                "properties": {"指标": "血糖"},
                "confidence": 0.9,
            },
            {
                "name_cn": "胰岛素",
                "type": "Drug",
                "description": "降糖药物",
                "properties": {"适应症": "糖尿病"},
                "confidence": 0.88,
            },
        ],
        "relations": [
            {"source": "胰岛素", "target": "糖尿病", "type": "treats", "confidence": 0.87},
            {"source": "胰岛素", "target": "糖尿病", "type": "treats", "confidence": 0.86},
        ],
        "logic_rules": [
            {"name_cn": "血糖升高诊断规则", "formula": "IF 血糖升高 THEN 考虑糖尿病", "linked_entities": ["糖尿病"]},
        ],
        "actions": [],
    }

    merged = _merge_ontology_results(base, incoming)

    assert len(merged["entities"]) == 2
    diabetes = next(e for e in merged["entities"] if e["name_cn"] == "糖尿病")
    assert diabetes["properties"] == {"病程": "慢性", "指标": "血糖"}
    assert diabetes["confidence"] == 0.9
    assert len(merged["relations"]) == 1
