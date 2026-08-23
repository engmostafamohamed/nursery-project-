export function generateDailyReportShareText(input: {
  childName: string;
  date: string;
  mood: string;
  meals: string;
  nap: string;
  activities: string;
  teacherName: string;
}) {
  return [
    `📋 ${input.childName}'s Daily Report - ${input.date}`,
    `😊 Mood: ${input.mood}`,
    `🍽️ Meals: ${input.meals}`,
    `😴 Nap: ${input.nap}`,
    `🎨 Activities: ${input.activities}`,
    `Teacher: ${input.teacherName}`,
  ].join('\n');
}
