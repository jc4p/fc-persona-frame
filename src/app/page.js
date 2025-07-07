import styles from "./page.module.css";
import { HomeComponent } from '@/components/HomeComponent';

export async function generateMetadata({ searchParams }) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return {
    title: 'FC Personas',
    description: 'What does your Farcaster Persona look like?',
    other: {
      'fc:frame': JSON.stringify({
        version: "next",
        imageUrl: "https://cover-art.kasra.codes/personas_rectangle.png",
        button: {
          title: "See Your Persona",
          action: {
            type: "launch_frame",
            name: "FC Personas",
            url: appUrl,
            splashImageUrl: "https://cover-art.kasra.codes/personas_square.png",
            splashBackgroundColor: "#8060C2"
          }
        }
      })
    }
  };
}

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <HomeComponent />
      </main>
    </div>
  );
}
