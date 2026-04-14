import React from "react";

// This component has violations
type Props = { name: string; age: number };

var count = 0;

const App = () => {
  const color = "#ff0000";
  const label = a > 1 ? "big" : a > 0 ? "small" : "zero";

  return (
    <div onClick={() => alert("hi")}>
      <span>{label}</span>
      {["a", "b"].map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </div>
  );
};

export default App;
