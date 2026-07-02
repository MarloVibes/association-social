import { router } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { getHelpFaqSections } from '@/domain/help/faq';

const sections = getHelpFaqSections();

export default function HelpFaqScreen() {
  const openEmail = () => {
    Linking.openURL('mailto:MarloLLC@icloud.com');
  };

  const openInstagram = () => {
    Linking.openURL('https://www.instagram.com/FranchiseMobile');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.eyebrow}>Franchise Mobile</Text>
          <Text style={styles.title}>Help / FAQ</Text>
        </View>
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Quick answers for GMs</Text>
        <Text style={styles.heroText}>League setup, live games, trades, grades, and contact info live here.</Text>
      </View>

      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.items.map((item) => {
            const isEmail = item.answer.includes('MarloLLC@icloud.com');
            const isInstagram = item.answer.includes('FranchiseMobile') && section.title === 'Contact';
            return (
              <TouchableOpacity
                key={item.question}
                activeOpacity={isEmail || isInstagram ? 0.75 : 1}
                style={styles.itemCard}
                onPress={isEmail ? openEmail : isInstagram ? openInstagram : undefined}
              >
                <Text style={styles.question}>{item.question}</Text>
                <Text style={styles.answer}>{item.answer}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  content: { padding: 22, paddingTop: 58, paddingBottom: 44, gap: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backButton: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#151515', borderWidth: 1, borderColor: '#262626', alignItems: 'center', justifyContent: 'center' },
  backButtonText: { color: '#00ff87', fontSize: 38, fontWeight: '700', lineHeight: 42 },
  headerTextWrap: { flex: 1 },
  eyebrow: { color: '#777', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 },
  title: { color: '#fff', fontSize: 34, fontWeight: '900', marginTop: 2, letterSpacing: 0 },
  heroCard: { backgroundColor: '#07170f', borderWidth: 1, borderColor: '#174d34', borderRadius: 18, padding: 18 },
  heroTitle: { color: '#ffffff', fontSize: 22, fontWeight: '900' },
  heroText: { color: '#9ab6a7', fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 8 },
  section: { gap: 10 },
  sectionTitle: { color: '#00ff87', fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 },
  itemCard: { backgroundColor: '#111111', borderRadius: 16, borderWidth: 1, borderColor: '#252525', padding: 16, gap: 7 },
  question: { color: '#ffffff', fontSize: 17, fontWeight: '900' },
  answer: { color: '#a0a0a0', fontSize: 14, fontWeight: '700', lineHeight: 20 },
});
