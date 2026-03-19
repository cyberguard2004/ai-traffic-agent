import json
import os

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # <--- autorise toutes les requêtes cross-origin


def ask_phi3(prompt, model="phi3", max_tokens=3500):
    url = "http://127.0.0.1:11434/api/generate"
    data = {"model": model, "prompt": prompt, "max_tokens": max_tokens}
    response = requests.post(url, json=data)
    full_text = ""
    for line in response.text.splitlines():
        try:
            token = json.loads(line)
            full_text += token["response"]
        except:
            pass
    return full_text


@app.route("/generate-course", methods=["POST"])
def generate_course():
    data = request.get_json()
    interests = data.get("interests", "React.js")

    book_dir = f"courses/{interests.replace(' ', '_')}"
    os.makedirs(book_dir, exist_ok=True)

    # Sommaire
    sommaire_prompt = (
        f"Sommaire complet d'un cours sur {interests}, 30 modules, 220 pages"
    )
    sommaire = ask_phi3(sommaire_prompt)
    with open(f"{book_dir}/sommaire.txt", "w", encoding="utf-8") as f:
        f.write(sommaire)

    # Modules
    modules_texts = []
    for i in range(1, 31):
        module_prompt = (
            f"Module {i} du cours sur {interests}, avec explications, exercices et code"
        )
        module_text = ask_phi3(module_prompt)
        modules_texts.append(module_text)
        with open(f"{book_dir}/module_{i}.txt", "w", encoding="utf-8") as f:
            f.write(module_text)

    # Projet final
    project_prompt = (
        f"Projet final pour {interests} en Python + HTML + JS, complet et prêt à tester"
    )
    final_project = ask_phi3(project_prompt)
    with open(f"{book_dir}/final_project.txt", "w", encoding="utf-8") as f:
        f.write(final_project)

    return jsonify(
        {
            "message": f"Cours complet et projet final générés dans '{book_dir}'",
            "sommaire": sommaire,
            "modules_preview": [m[:500] for m in modules_texts],  # preview du contenu
            "final_project_preview": final_project[:500],
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
