This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# NOCTA

## Base de datos y roles

La aplicación conserva el modo demo local cuando no hay variables de Supabase. Para activar autenticación y PostgreSQL:

1. Crea un proyecto en Supabase y ejecuta `supabase/migrations/202608150001_identity_rbac.sql`.
2. Copia `.env.example` a `.env.local` y agrega la URL y la llave publicable del proyecto.
3. Crea los usuarios en Supabase Auth y asigna sus perfiles en las tablas de membresías correspondientes.

Los promotores son independientes de los establecimientos. Su identidad vive en `promoter_profiles`; crean eventos y módulos `conecta_modules` propios. La relación con una sede se concede por evento mediante `event_venue_collaborations`, con aprobación del establecimiento.
