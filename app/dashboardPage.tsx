"use client";
import {
  Button,
  Center,
  Group,
  HoverCard,
  Image,
  LoadingOverlay,
  MultiSelect,
  NavLink,
  NumberInput,
  NumberInputHandlers,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Space,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { motion, useScroll } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import onScan from "onscan.js";
import { PartState } from "@/lib/helper/part_state";
import { get } from "http";
import { format, round, unit } from "mathjs";
import {
  IconArrowLeftFromArc,
  IconLink,
  IconMinus,
  IconPdf,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import ValueSearch, {
  ValueSearchRef,
} from "@/lib/components/search/ValueSearch";

// declare global {
//   interface Window {
//     scan: any;
//   }
// }

export function scannerInputToType(partScannerInput: string): ScannerPartState {
  var json = {} as { [key: string]: string };
  if (partScannerInput) {
    partScannerInput.split(",").forEach((item) => {
      var key = item.split(":")[0];
      var value = item.split(":")[1];
      json[key] = value;
    });
    var pmVal = json.pm;
    var qtyVal = json.qty;
    var pdi = json.pdi;
    var pc = json.pc;
    var on = json.on;
    var pbn = json.pbn;

    return { pm: pmVal, qty: Number(qtyVal), pdi, pc, on, pbn };
  }
  return { pm: "", qty: 0, pc: "", error: true};
}
export interface ScannerPartState {
  pbn?: string;
  on?: string;
  pc: string;
  pm: string;
  qty: number;
  pdi?: string;
  error?: boolean;
}
type Operations = ">" | "<" | "=" | "<=" | ">=";

export interface FilterState {
  productCode?: string;
  productTitle?: string;
  productDescription?: string; //Deep search
  parentCatalogName?: string;
  encapStandard?: string;
  voltage?: { operation: Operations | string | null; value: number | null }; //operation referring to "<" ">" "="
  resistance?: { operation: Operations | string | null; value: number | null };
  power?: { operation: Operations | string | null; value: number | null };
  current?: { operation: Operations | string | null; value: number | null };
  tolerance?: string; //Selector
  frequency?: { operation: Operations | string | null; value: number | null };
  capacitance?: { operation: Operations | string | null; value: number | null }; //value is in pF
}

export default function DashboardPage({
  loadedParts,
  itemCount,
  parentCatalogNames,
}: {
  loadedParts: PartState[];
  itemCount: number;
  parentCatalogNames: string[];
}) {
  const itemsPerPage = 10;

  const [manualScannerInput, setManualScannerInput] = useState<string>("");
  const [isLoading, setLoading] = useState(false);
  const [itemCountState, setItemCountState] = useState(itemCount);
  const [parentCatalogNamesState, setParentCatalogNamesState] =
    useState<string[]>(parentCatalogNames);

  const [parts, setParts] = useState<PartState[]>(loadedParts);
  // const [searchResult, setSearchResult] = useState<PartState[]>();
  const [isSearchResult, setIsSearchResult] = useState(false);
  const [searchFilter, setSearchFilter] = useState<FilterState>();
  const [activePage, setPage] = useState(1);

  const voltageSearchRef = useRef<ValueSearchRef>(null);
  const resistanceSearchRef = useRef<ValueSearchRef>(null);
  const powerSearchRef = useRef<ValueSearchRef>(null);
  const currentSearchRef = useRef<ValueSearchRef>(null);
  const frequencySearchRef = useRef<ValueSearchRef>(null);
  const capacitanceSearchRef = useRef<ValueSearchRef>(null);

  useEffect(() => {
    if (typeof document !== "undefined") {
      if (onScan.isAttachedTo(document) == false) {
        console.log("attaching onScan");
        onScan.attachTo(document, {
          suffixKeyCodes: [13], // enter-key expected at the end of a scan
          // reactToPaste: true, // Compatibility to built-in scanners in paste-mode (as opposed to keyboard-mode)
          // timeBeforeScanTest: 3,
          // avgTimeByChar: 1,
          // scanButtonLongPressTime: 20,
          keyCodeMapper: function (oEvent) {
            if (oEvent.keyCode === 190) {
              return ":";
            }
            if (oEvent.keyCode === 188) {
              return ",";
            }
            return onScan.decodeKeyEvent(oEvent);
          },
          onScan: async function (sCode, iQty) {
            console.log("Scanned: " + sCode);
            if (sCode) {
              let scanJson = JSON.parse(JSON.stringify(sCode));
              if (scanJson) {
                let partInfo = scannerInputToType(scanJson);
                setLoading(true);
                await getPartInfoFromLCSC(partInfo.pc, partInfo.qty);
                setLoading(false);
              }
            }
          },
        });
      } else {
        console.log("onScan already attached to document");
      }
    }
  }, []);

  

  const updatePartInState = (part: PartState) => {
    setParts((prevParts) => {
      const index = prevParts.findIndex((p) => p.id === part.id);
      if (index !== -1) {
        const updatedPart = { ...part };
        const newParts = [...prevParts];
        newParts[index] = updatedPart;
        return newParts;
      }
      return prevParts;
    });
  };

  const handleSearchInputChange = (input: {
    name: string;
    value: string | { operation: Operations; value: number } | null;
  }) => {
    setSearchFilter((prevFilter) => {
      return {
        ...prevFilter,
        [input.name]: input.value,
      };
    });
  };

  const addPartInState = (part: PartState) => {
    setParts((prevParts) => {
      const newParts = [...prevParts, part];
      return newParts.sort((a, b) => b.id - a.id);
    });
  };

  const deletePartInState = (partId: number) => {
    setParts((prevParts) => {
      const newParts = prevParts.filter((part) => part.id !== partId);
      return newParts;
    });
  };

  async function searchParts(page: number) {
    setLoading(true);
    try {
      let currentSearchFilter = searchFilter || {};
      if (currentSearchFilter) {
        currentSearchFilter.voltage =
          voltageSearchRef.current?.getSearchParameters();
        currentSearchFilter.resistance =
          resistanceSearchRef.current?.getSearchParameters();
        currentSearchFilter.power =
          powerSearchRef.current?.getSearchParameters();
        currentSearchFilter.current =
          currentSearchRef.current?.getSearchParameters();
        currentSearchFilter.frequency =
          frequencySearchRef.current?.getSearchParameters();
        currentSearchFilter.capacitance =
          capacitanceSearchRef.current?.getSearchParameters();
      }
      console.log(voltageSearchRef.current?.getSearchParameters());
      console.log(currentSearchFilter);

      const res = await fetch("/api/parts/search", {
        method: "POST",
        body: JSON.stringify({ filter: currentSearchFilter, page: page }),
      }).then((response) =>
        response
          .json()
          .then((data) => ({ status: response.status, body: data }))
      );
      if (res.status !== 200) {
        throw new Error(res.body.message);
      }
      console.log(res.body);
      const response = res.body.parts as PartState[];
      if (response) {
        // setSearchResult(response);
        setParts(response);
        if (!isSearchResult) {
          setIsSearchResult(true);
          setPage(page);
        }
      }
      // setParts(res.body);
    } catch (e: ErrorCallback | any) {
      console.error(e.message);
    }
    setLoading(false);
  }

  async function getParts(page: number) {
    setLoading(true);
    try {
      const res = await fetch("/api/parts?page=" + page).then((response) =>
        response
          .json()
          .then((data) => ({ status: response.status, body: data }))
      );
      if (res.status !== 200) {
        throw new Error(res.body.message);
      }
      console.log("GET PARTS");
      const response = res.body.parts as PartState[];
      if (response) {
        setParts(response);
      }
      // setParts(res.body);
    } catch (e: ErrorCallback | any) {
      console.error(e.message);
    }
    setLoading(false);
  }

  async function clearSearch() {
    setSearchFilter(undefined);
    setIsSearchResult(false);
    voltageSearchRef?.current?.clear();
    resistanceSearchRef?.current?.clear();
    powerSearchRef?.current?.clear();
    currentSearchRef?.current?.clear();
    frequencySearchRef?.current?.clear();
    capacitanceSearchRef?.current?.clear();
    setPage(1);
    await getParts(1);
  }

  //https://www.lcsc.com/product-detail/Multilayer-Ceramic-Capacitors-MLCC-SMD/SMT_Samsung-Electro-Mechanics-CL10B104KB8NNNC_C1591.html
  async function getPartInfoFromLCSC(pc: string, quantity: number) {
    // fetch part info from LCSC
    // return part info
    try {
      const res = await fetch("/api/parts", {
        method: "POST",
        body: JSON.stringify({ pc: pc, quantity }),
      }).then((response) =>
        response
          .json()
          .then((data) => ({ status: response.status, body: data }))
      );
      if (res.status !== 200) {
        throw new Error(res.body.message);
      }
      if (res.body.message == "Part updated") {
        notifications.show({
          title: "Part Updated",
          message: `The quantity of the part (${res.body.body.productCode}) was successfully updated to ${res.body.body.quantity}!`,
        });
        updatePartInState(res.body.body);
      }
      if (res.body.message == "Part created") {
        notifications.show({
          title: "Part Added",
          message: `The part ${res.body.body.productCode} was successfully added!`,
        });
        console.log("PART CREATED");
        // if(Math.ceil(itemCountState / itemsPerPage) > Math.ceil(res.body.itemCount)) {

        getParts(activePage);
        setParentCatalogNamesState(res.body.parentCatalogNames);
        setItemCountState(res.body.itemCount);
      }
      // console.log(res.body);
      // await getParts();
    } catch (e: ErrorCallback | any) {
      console.error(e.message);
    }
  }

  async function deletePart(partId: number) {
    // setLoading(true)
    try {
      const res = await fetch("/api/parts/delete", {
        method: "POST",
        body: JSON.stringify({ id: partId }),
      }).then((response) =>
        response
          .json()
          .then((data) => ({ status: response.status, body: data }))
      );
      if (res.status !== 200) {
        console.log(res.body.message);
        // throw new Error(res.body.message);
      }
      if (res.status == 200) {
        // deletePartInState(partId);
        if (
          Math.ceil(itemCountState / itemsPerPage) >
            Math.ceil(res.body.itemCount) &&
          activePage == Math.ceil(itemCountState / itemsPerPage)
        ) {
          navigatePage(activePage - 1);
          // setPage(activePage - 1);
        } else {
          getParts(activePage);
        }
        setParentCatalogNamesState(res.body.parentCatalogNames);
        setItemCountState(res.body.itemCount);
        notifications.show({
          title: "Part Deleted",
          message: `The part ${res.body.body.productCode} was successfully deleted!`,
        });
      }
      console.log(res.body);
      // await getParts();
    } catch (e: ErrorCallback | any) {
      console.error(e.message);
    }
    // setLoading(false)
  }

  async function updatePartQuantity(partId: number, quantity: number) {
    setLoading(true);
    try {
      const res = await fetch("/api/parts/update", {
        method: "POST",
        body: JSON.stringify({ id: partId, quantity }),
      }).then((response) =>
        response
          .json()
          .then((data) => ({ status: response.status, body: data }))
      );
      if (res.status !== 200) {
        throw new Error(res.body.message);
      }
      console.log(res.body);
      if (res.status == 200) {
        notifications.show({
          title: "Quantity Updated",
          message: `The quantity of ${res.body.body.productCode} was successfully updated to ${quantity}!`,
        });
        updatePartInState(res.body.body);
      }
      // await getParts();
      // const updatedPart = res.body as PartState;
      // await updatePartInState(updatedPart);
    } catch (e: ErrorCallback | any) {
      console.error(e.message);
    }
    setLoading(false);
  }

  async function navigatePage(page: number) {
    setPage(page);
    if (isSearchResult) {
      await searchParts(page);
    } else {
      await getParts(page);
    }
  }

  // const [visible, { toggle }] = useDisclosure(false);

  return (
    <Stack gap={"sm"} style={{ overflowX: "hidden" }}>
      {/* <motion.div
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0 }}
      ></motion.div> */}
      <Paper
        m={"sm"}
        withBorder
        shadow="md"
        style={{ position: "sticky", top: "10px", overflow: "hidden" }}
      >
        <Stack p={"sm"}>
          <SimpleGrid cols={{ lg: 6, sm: 2, xl: 6, md: 4 }} spacing={2}>
            <ValueSearch valueType="voltage" ref={voltageSearchRef} />
            <ValueSearch valueType="resistance" ref={resistanceSearchRef} />
            <ValueSearch valueType="power" ref={powerSearchRef} />
            <ValueSearch valueType="current" ref={currentSearchRef} />
            {/* <TextInput
          placeholder="Tolerance"
          value={searchFilter?.tolerance ?? ""}
          onChange={(event) => {
            const tolerance = event.currentTarget.value;
            handleSearchInputChange({
              name: "tolerance",
              value: tolerance,
            });
          }}
          /> */}
            <ValueSearch valueType="frequency" ref={frequencySearchRef} />
            <ValueSearch valueType="capacitance" ref={capacitanceSearchRef} />

            <TextInput
              placeholder="Title"
              value={searchFilter?.productTitle ?? ""}
              radius={0}
              onChange={(event) => {
                const productTitle = event.currentTarget.value;
                handleSearchInputChange({
                  name: "productTitle",
                  value: productTitle,
                });
              }}
            />
            <TextInput
              placeholder="Product Code"
              value={searchFilter?.productCode ?? ""}
              radius={0}
              onChange={(event) => {
                // const productCode = event.currentTarget.value;
                const productCode = event.currentTarget.value.replace(
                  /\s/g,
                  ""
                );
                handleSearchInputChange({
                  name: "productCode",
                  value: productCode,
                });
              }}
            />

            <TextInput
              placeholder="Description"
              value={searchFilter?.productDescription ?? ""}
              radius={0}
              onChange={(event) => {
                const productDescription = event.currentTarget.value;
                handleSearchInputChange({
                  name: "productDescription",
                  value: productDescription,
                });
              }}
            />
            <Select
              placeholder="Catalog"
              value={searchFilter?.parentCatalogName ?? ""}
              radius={0}
              onChange={(value) => {
                console.log("CHANGED");
                handleSearchInputChange({
                  name: "parentCatalogName",
                  value: value,
                });
              }}
              data={parentCatalogNamesState}
              clearable
              searchable
            />
            <Button
              onClick={() => {
                console.log("SEARCH");
                searchParts(1);
              }}
              rightSection={<IconSearch />}
              radius={0}
            >
              Search
            </Button>
            <Button
              onClick={() => {
                clearSearch();
              }}
              radius={0}
              // disabled={!isSearchResult}
            >
              Clear
            </Button>
          </SimpleGrid>
        </Stack>
      </Paper>
      {/* <TextInput
          placeholder="Manual input"
          onChange={(event) => {
            setManualScannerInput(event.currentTarget.value);
          }}
          value={manualScannerInput}
        />
        <Button
          onClick={() => {
            if (manualScannerInput) {
              let scanJson = JSON.parse(JSON.stringify(manualScannerInput));
              if (scanJson) {
                let partInfo = scannerInputToType(scanJson);

                getPartInfoFromLCSC(partInfo.pc, partInfo.qty);
              }
              setManualScannerInput("");
            }
          }}
        >
          Manual Add
        </Button> */}
      <Paper p={"sm"}>
        <Stack>
          {parts != null && parts.length > 0 ? (
            <Table.ScrollContainer minWidth={500}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Image</Table.Th>
                    {/* <Table.Th>ID</Table.Th> */}
                    <Table.Th>Title</Table.Th>
                    <Table.Th>ProductCode</Table.Th>
                    <Table.Th>Quantity</Table.Th>
                    <Table.Th>Quantity Actions</Table.Th>
                    <Table.Th>ProductID</Table.Th>
                    <Table.Th>ProductModel</Table.Th>
                    <Table.Th>Description</Table.Th>
                    <Table.Th>ParentCatalogName</Table.Th>
                    <Table.Th>CatalogName</Table.Th>
                    <Table.Th>BrandName</Table.Th>
                    <Table.Th>EncapStandard</Table.Th>
                    {/* <Table.Th>ProductImages</Table.Th> */}
                    <Table.Th>Pdf</Table.Th>
                    <Table.Th>Link</Table.Th>
                    {/* <Table.Th>Prices</Table.Th> */}
                    <Table.Th>Price</Table.Th>
                    <Table.Th>Voltage</Table.Th>
                    <Table.Th>Resistance</Table.Th>
                    <Table.Th>Power</Table.Th>
                    <Table.Th>Current</Table.Th>
                    <Table.Th>Tolerance</Table.Th>
                    <Table.Th>Frequency</Table.Th>
                    <Table.Th>Capacitance</Table.Th>
                    <Table.Th>Delete</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {parts.map((element) => (
                    <PartItem
                      key={element.id}
                      part={element}
                      isLoading={isLoading}
                      updatePartQuantity={updatePartQuantity}
                      deletePart={deletePart}
                    />
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : (
            // <Center>
            //   <Paper withBorder radius={"sm"} shadow="sm">
            //     <Stack p={"md"}>
            //       <Image src="/images/start.svg" h={400} fit="contain" />
            //       <Text ta={"center"}>No parts found</Text>
            //       <Group justify="center" grow>
            //         <Button onClick={() => getParts(1)}>Add Part</Button>
            //         <Button onClick={() => getParts(1)}>Refresh</Button>
            //       </Group>
            //     </Stack>
            //   </Paper>
            // </Center>
            <Paper w={"100%"} shadow="sm" withBorder>
              <Text p={"sm"}>No Parts Found</Text>
            </Paper>
          )}
          <Group>
            <Pagination
              total={Math.ceil(itemCountState / itemsPerPage)}
              value={activePage}
              onChange={async (value: number) => {
                await navigatePage(value);
              }}
            />
            <Text c="dimmed">({itemCountState})</Text>
          </Group>
        </Stack>
      </Paper>
      {/* <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ delay: 0.6 }}
      ></motion.div> */}
    </Stack>
  );
}

function PartItem({
  part,
  isLoading,
  updatePartQuantity,
  deletePart,
}: {
  part: PartState;
  isLoading: boolean;
  updatePartQuantity: (partId: number, quantity: number) => Promise<void>;
  deletePart: (partId: number) => Promise<void>;
}) {
  const addQuantityRef = useRef<HTMLInputElement>(null);
  const removeQuantityRef = useRef<HTMLInputElement>(null);
  return (
    <Table.Tr key={part.id}>
      <LoadingOverlay
        visible={isLoading}
        zIndex={1000}
        overlayProps={{ blur: 5, opacity: 0.5 }}
      />
      <Table.Td>
        <img
          src={part.productImages[0]}
          alt={part.title}
          width="100"
          height="100"
        />
      </Table.Td>
      {/* <Table.Td>{part.id}</Table.Td> */}
      <Table.Td><Stack gap={"sm"}>{part.title}
      <NavLink
          href={"/part/" + part.id}
          // target="_blank"
          label="Details"
          active
          leftSection={
            <ThemeIcon>
              <IconArrowLeftFromArc />
            </ThemeIcon>
          }
        />
      </Stack></Table.Td>
      <Table.Td>{part.productCode}</Table.Td>
      <Table.Td>{part.quantity}</Table.Td>
      <Table.Td>
        <Tabs variant="outline" defaultValue={"add"} w={200}>
          <Tabs.List justify="center">
            <Tabs.Tab value={"add"}>Add</Tabs.Tab>
            <Tabs.Tab value={"remove"}>Remove</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="add">
            <Stack gap={"sm"} pt={3}>
              <NumberInput
                placeholder="Quantity"
                label="Quantity"
                min={1}
                clampBehavior="strict"
                defaultValue={1}
                ref={addQuantityRef}
              />
              <Button
                disabled={isLoading}
                onClick={async () => {
                  console.log(addQuantityRef.current?.value);
                  await updatePartQuantity(
                    part.id,
                    part.quantity + Number(addQuantityRef.current?.value)
                  );
                }}
              >
                Add
              </Button>
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="remove">
            <Stack gap={"sm"} pt={3}>
              <NumberInput
                placeholder="Quantity"
                label="Quantity"
                min={1}
                max={part.quantity}
                clampBehavior="strict"
                defaultValue={part.quantity ?? 1}
                ref={removeQuantityRef}
              />
              <Button
                disabled={isLoading}
                onClick={async () => {
                  console.log(removeQuantityRef.current?.value);
                  await updatePartQuantity(
                    part.id,
                    part.quantity - Number(removeQuantityRef.current?.value)
                  );
                }}
              >
                Remove
              </Button>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Table.Td>
      <Table.Td>{part.productId}</Table.Td>
      <Table.Td>{part.productModel}</Table.Td>
      <Table.Td>{part.productDescription}</Table.Td>
      <Table.Td>{part.parentCatalogName}</Table.Td>
      <Table.Td>{part.catalogName}</Table.Td>
      <Table.Td>{part.brandName}</Table.Td>
      <Table.Td>{part.encapStandard}</Table.Td>
      <Table.Td>
        <NavLink
          href={part.pdfLink}
          target="_blank"
          label="Link"
          active
          leftSection={
            <ThemeIcon>
              <IconPdf />
            </ThemeIcon>
          }
        />
      </Table.Td>
      <Table.Td>
        <NavLink
          href={part.productLink}
          target="_blank"
          label="Product"
          active
          leftSection={
            <ThemeIcon>
              <IconLink />
            </ThemeIcon>
          }
        />
      </Table.Td>
      <HoverCard position="left" withArrow>
        <HoverCard.Target>
          <Table.Td>{part.prices.at(0)?.price + "$"}</Table.Td>
        </HoverCard.Target>
        <HoverCard.Dropdown>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Quantity</Table.Th>
                <Table.Th>Price</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {part.prices.map((price) => (
                <Table.Tr key={price.ladder}>
                  <Table.Td>{price.ladder}</Table.Td>
                  <Table.Td>{price.price + "$"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {/* {element.prices.map(price => <Text key={price.ladder}>{`Quantity: ${price.ladder}, Price: ${price.price}$`}</Text>)} */}
        </HoverCard.Dropdown>
      </HoverCard>
      <Table.Td>{formatVoltage(part.voltage)}</Table.Td>
      <Table.Td>{formatResistance(part.resistance)}</Table.Td>
      <Table.Td>{formatPower(part.power)}</Table.Td>
      <Table.Td>{formatCurrent(part.current)}</Table.Td>
      <Table.Td>{part.tolerance}</Table.Td>
      <Table.Td>{formatFrequency(part.frequency)}</Table.Td>
      <Table.Td>{formatCapacitance(part.capacitance)}</Table.Td>
      <Table.Td>
        <Button
          leftSection={
            <ThemeIcon color="red">
              <IconTrash />
            </ThemeIcon>
          }
          color="red"
          variant="light"
          onClick={async () => {
            deletePart(part.id);
          }}
        >
          Delete
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}

const formatVoltage = (voltage: any) =>
  `${
    voltage < 1
      ? round(unit(Number(voltage), "V").toNumeric("mV")) + " mV"
      : format(voltage, { lowerExp: -2, upperExp: 2 }) + " V"
  }`;
const formatResistance = (resistance: any) =>
  `${
    resistance < 1
      ? round(unit(Number(resistance), "ohm").toNumeric("mohm")) + " mΩ"
      : resistance >= 1000
      ? round(unit(Number(resistance), "ohm").toNumeric("kohm")) + " kΩ"
      : format(resistance, { lowerExp: -2, upperExp: 2 }) + " Ω"
  }`;
const formatPower = (power: any) =>
  `${
    power < 1
      ? round(unit(Number(power), "W").toNumeric("mW")) + " mW"
      : format(power, { lowerExp: -2, upperExp: 2 }) + " W"
  }`;
const formatCurrent = (current: any) =>
  `${
    current < 1
      ? round(unit(Number(current), "A").toNumeric("mA")) + " mA"
      : format(current, { lowerExp: -2, upperExp: 2 }) + " A"
  }`;
const formatFrequency = (frequency: any) =>
  `${
    frequency < 1
      ? round(unit(Number(frequency), "Hz").toNumeric("mHz")) + " mHz"
      : frequency >= 1000000
      ? round(unit(Number(frequency), "Hz").toNumeric("MHz")) + " MHz"
      : frequency >= 1000
      ? round(unit(Number(frequency), "Hz").toNumeric("kHz")) + " kHz"
      : format(frequency, { lowerExp: -2, upperExp: 2 }) + " Hz"
  }`;
const formatCapacitance = (capacitance: any) => {
  return `${round(unit(Number(capacitance), "pF").toNumeric("nF"))} nF`;
};
