import {
  LogseqCopliotConfig,
  getLogseqCopliotConfig,
  saveLogseqCopliotConfig,
} from '@/config';
import {
  Heading,
  Text,
  Switch,
  Grid,
  RadioGroup,
  Stack,
  Radio,
  Textarea,
} from '@chakra-ui/react';
import LogseqClient from '@pages/logseq/client';

import { Select } from 'chakra-react-select';
import React, { useEffect } from 'react';
import styles from '../Options.module.scss';

const client = new LogseqClient();

export const ClipNoteOptions = () => {
  const [init, setInit] = React.useState(false);

  const [logseqConfig, setLogseqConfig] = React.useState<LogseqCopliotConfig>();
  const [allPages, setAllPages] = React.useState([]);

  useEffect(() => {
    if (!init) {
      getLogseqCopliotConfig().then((config) => {
        setLogseqConfig(config);
        setInit(true);
      });

      client.getAllPages().then((allPages) => {
        setAllPages(
          allPages.map((page) => {
            return {
              label: page.originalName,
              value: page.name,
            };
          }),
        );
      });
    }
  });

  const updateConfig = (key: string, value: string) => {
    setLogseqConfig({
      ...logseqConfig,
      [key]: value,
    });
    saveLogseqCopliotConfig({
      [key]: value,
    });
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig(e.target.name, e.target.value || e.target.checked);
  };

  const onClipNoteLocationSelect = (value: string) => {
    updateConfig('clipNoteLocation', value);
  };

  const onClipNoteCustomPageSelect = (value) => {
    updateConfig('clipNoteCustomPage', value.value);
  };

  return (
    <>
      <Heading size={'lg'}>Clip Note</Heading>

      <Grid
        width={'full'}
        gridTemplateColumns={'160px 1fr'}
        alignItems={'center'}
        justifyItems={'left'}
        rowGap={2}
        columnGap={2}
      >
        <Text fontSize="md" mb="0">Display Floating Button</Text>
        <Switch
          name="enableClipNoteFloatButton"
          isChecked={logseqConfig?.enableClipNoteFloatButton}
          onChange={onChange}
        />
        <Text fontSize="md">Clip Location</Text>
        <RadioGroup
          defaultValue="journal"
          name="clipNoteLocation"
          value={logseqConfig?.clipNoteLocation}
          onChange={onClipNoteLocationSelect}
        >
          <Stack spacing={5} direction="row">
            <Radio value="journal">Journal</Radio>
            <Radio value="currentPage">Current Page</Radio>
            <Radio value="customPage">Custom Page</Radio>
          </Stack>
        </RadioGroup>
        <Text fontSize="md">Custom Page</Text>
        <Select
          classNamePrefix={'chakra-react-select'}
          className={styles.selection}
          isDisabled={logseqConfig?.clipNoteLocation !== 'customPage'}
          name="customPage"
          options={allPages}
          value={{
            label: logseqConfig?.clipNoteCustomPage,
            value: logseqConfig?.clipNoteCustomPage,
          }}
          onChange={onClipNoteCustomPageSelect}
        />
        <Text fontSize="md">Clip Template</Text>
        <Textarea
          height={36}
          name="clipNoteTemplate"
          onChange={onChange}
          value={logseqConfig?.clipNoteTemplate}
        />
        <Text
          gridColumn={'1 / span 2'}
          size={"sm"}
        >{`Available params: {{date}} {{time}} {{title}} {{link}} {{content}}`}</Text>

        {/* <Text fontSize={'sm'} mb="0">
            Quick Capture Shortcuts
          </Text>
          <Kbd justifySelf={'end'}>⌘ + T</Kbd> */}
      </Grid>
    </>
  );
};
