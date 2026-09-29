import { JSXElement } from "solid-js";

import { CustomTestDurationModal } from "./CustomTestDurationModal";
import { CustomTextModal } from "./CustomTextModal";
import { CustomWordAmountModal } from "./CustomWordAmountModal";
import { MobileTestConfigModal } from "./MobileTestConfigModal";
import { PbTablesModal } from "./PbTablesModal";
import { QuoteSearchModal } from "./QuoteSearchModal";
import { ShareTestSettings } from "./ShareTestSettings";
import { SimpleModal } from "./SimpleModal";

export function Modals(): JSXElement {
  return (
    <>
      <SimpleModal />
      <CustomTextModal />
      <QuoteSearchModal />
      <CustomTestDurationModal />
      <CustomWordAmountModal />
      <PbTablesModal />
      <ShareTestSettings />
      <MobileTestConfigModal />
    </>
  );
}
