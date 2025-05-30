import {
  Flex,
  Container,
  Heading,
  Text,
  Link,
  Divider,
} from '@chakra-ui/react';
import { LogseqConnectOptions } from './components/Connect';
import { ClipNoteOptions } from './components/ClipNote';
import styles from './Options.module.scss';

const version = import.meta.env.WXT_EXT_VERSION;

console.log(import.meta.env);
const Options = () => {
  return (
    <Container className={styles.options} maxW={'56rem'} mt={'1rem'}>
      <Flex direction={'row'}>
        <Flex direction={'column'} w={'16rem'}>
          <Heading>Logseq Copilot</Heading>
          <Text>
            <Link
              href={`https://github.com/EINDEX/logseq-copilot/releases/tag/${version}`}
            >
              {version}
            </Link>
          </Text>
        </Flex>
        <Flex direction={'column'} w={'40rem'} gap={2}>
          <LogseqConnectOptions />

          <Divider />

          <ClipNoteOptions />
        </Flex>
      </Flex>
    </Container>
  );
};

export default Options;
