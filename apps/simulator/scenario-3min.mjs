// 3 dakikalık sahte yayın senaryosu: katılım, hediye basamakları, streak, düello tadı, DROP
export default [
  { type: "chat", userId: "u-elif", name: "Elif", text: "Elif" },
  { type: "chat", userId: "u-burak", name: "Burak", text: "@u-burak" },
  { type: "chat", userId: "u-spam", name: "spam bot reklam", text: "tamamen alakasiz selam millet" },
  // streak: ara olaylar sayılmaz
  { type: "gift", userId: "u-elif", name: "Elif", giftName: "Gül", diamonds: 1, repeat: 1, repeatEnd: false },
  { type: "gift", userId: "u-elif", name: "Elif", giftName: "Gül", diamonds: 1, repeat: 5, repeatEnd: true },
  { type: "gift", userId: "u-burak", name: "Burak", giftName: "Kalp", diamonds: 60, repeat: 1, repeatEnd: true },
  { type: "gift", userId: "u-ayse", name: "Ayşe", giftName: "Balon", diamonds: 350, repeat: 1, repeatEnd: true },
  { type: "gift", userId: "u-mehmet", name: "Mehmet", giftName: "Aslan", diamonds: 1500, repeat: 1, repeatEnd: true },
  { type: "gift", userId: "u-burak", name: "Burak", giftName: "Aslan", diamonds: 2000, repeat: 1, repeatEnd: true },
  { type: "system", kind: "drop", payload: {} },
];
