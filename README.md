# MMM U-Cervix Frontend

Frontend Angular para el sistema de segmentación cervical con IA.

## 🚀 Deploy en GitHub Pages

### Paso 1 — Subir a GitHub

```bash
git init
git add .
git commit -m "feat: MMM U-Cervix frontend"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

### Paso 2 — Activar GitHub Pages

1. Ve a tu repositorio en GitHub
2. **Settings → Pages**
3. En **Source** selecciona: **GitHub Actions**
4. Guarda los cambios

### Paso 3 — Deploy automático

Cada `git push` a `main` lanzará el workflow automáticamente.
Tu sitio estará en: `https://TU_USUARIO.github.io/TU_REPOSITORIO/`

---

## 🛠️ Desarrollo local

```bash
npm install
ng serve
# Abre http://localhost:4200
```

## 📁 Estructura

```
src/app/
├── pages/
│   ├── segmentation/   # Página 1: Carga y visualización de imágenes
│   └── statistics/     # Página 2: Estadísticas del modelo
├── services/
│   ├── session.service.ts   # Historial de sesión + configuración de modelos
│   └── model.service.ts     # Comunicación con la API
└── app.component.*          # Shell de la aplicación con navegación
```

## 🔗 API

Backend en Hugging Face Spaces: `https://andr3s2004-models.hf.space/predict`

Para agregar nuevos modelos, edita `src/app/services/session.service.ts`, array `MODELS`.
