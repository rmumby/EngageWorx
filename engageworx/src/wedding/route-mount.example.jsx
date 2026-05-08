// src/wedding/route-mount.example.jsx
//
// Examples for mounting /weddings/:id in App.jsx. Pick the one that matches
// the existing react-router version. NOT imported anywhere — reference only.

// ─── react-router v6 ─────────────────────────────────────────────────────
//
// import { Routes, Route } from 'react-router-dom';
// import { WeddingDashboard } from './wedding';
//
// function App() {
//   return (
//     <Routes>
//       {/* ...existing routes... */}
//       <Route path="/weddings/:id" element={<WeddingDashboard />} />
//     </Routes>
//   );
// }
//
// In v6, WeddingDashboard reads the id via useParams() — but the component
// also accepts a `weddingId` prop or a v5-style `match` prop, so a tiny
// wrapper isn’t strictly needed. If a wrapper feels cleaner:
//
// import { useParams } from 'react-router-dom';
// function WeddingRoute() {
//   const { id } = useParams();
//   return <WeddingDashboard weddingId={id} />;
// }
// <Route path="/weddings/:id" element={<WeddingRoute />} />

// ─── react-router v5 ─────────────────────────────────────────────────────
//
// import { Switch, Route } from 'react-router-dom';
// import { WeddingDashboard } from './wedding';
//
// function App() {
//   return (
//     <Switch>
//       {/* ...existing routes... */}
//       <Route path="/weddings/:id" component={WeddingDashboard} />
//     </Switch>
//   );
// }
//
// In v5, WeddingDashboard receives `match` as a prop and reads match.params.id.

// ─── Custom router or HashRouter ─────────────────────────────────────────
//
// Pass the id as a prop:
//
// <WeddingDashboard weddingId={someId} />

export {};
